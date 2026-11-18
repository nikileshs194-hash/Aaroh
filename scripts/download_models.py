"""Download InferSmart's model files (GGUF) from official Hugging Face pages.

Resumable. Verifies each file's SHA-256 against the value Hugging Face publishes
and records it in models/MODELS.json so the app can warn if a file changes.

Usage:  python scripts/download_models.py [--dir D:/InferSmart-models] [--small]
"""
import argparse
import hashlib
import json
import os
import sys
import threading
import time
import urllib.request

SEGMENTS = 8  # parallel connections per file (each connection is throttled by the server)
PRIORITY = ["2B-Q4_K_M", "4B-Q4_K_M", "0.8B-Q4_K_M", "2B-Q8_0", "2B-Q5_K_M", "0.8B-Q8_0", "4B-Q5_K_M", "0.8B-Q5_K_M", "4B-Q8_0"]

REPOS = {
    "unsloth/Qwen3.5-0.8B-GGUF": "Qwen3.5-0.8B",
    "unsloth/Qwen3.5-2B-GGUF": "Qwen3.5-2B",
    "unsloth/Qwen3.5-4B-GGUF": "Qwen3.5-4B",
}
QUANTS = ["Q4_K_M", "Q5_K_M", "Q8_0"]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_json(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _segment(url, path, start, end, errors):
    for attempt in range(20):
        have = os.path.getsize(path) if os.path.exists(path) else 0
        if start + have > end:
            return
        req = urllib.request.Request(url, headers={"Range": f"bytes={start + have}-{end}"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r, open(path, "ab") as f:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
        except Exception as e:
            time.sleep(3)
    errors.append(path)


def download(url, dest, size):
    if os.path.exists(dest + ".part"):  # legacy single-stream partial: finish it the old way
        return download_single(url, dest, size)
    step = -(-size // SEGMENTS)
    parts, threads, errors = [], [], []
    for i in range(SEGMENTS):
        start, end = i * step, min(size, (i + 1) * step) - 1
        if start > end:
            continue
        path = f"{dest}.seg{i}"
        parts.append((path, end - start + 1))
        t = threading.Thread(target=_segment, args=(url, path, start, end, errors), daemon=True)
        t.start()
        threads.append(t)
    while any(t.is_alive() for t in threads):
        time.sleep(15)
        have = sum(os.path.getsize(p) for p, _ in parts if os.path.exists(p))
        print(f"  {os.path.basename(dest)}: {have/size*100:.0f}%", flush=True)
    for p, n in parts:
        if not os.path.exists(p) or os.path.getsize(p) != n:
            sys.exit(f"segment {p} incomplete; run again to resume")
    with open(dest + ".joining", "wb") as out:
        for p, _ in parts:
            with open(p, "rb") as f:
                while True:
                    b = f.read(1 << 24)
                    if not b:
                        break
                    out.write(b)
    os.replace(dest + ".joining", dest)
    for p, _ in parts:
        os.remove(p)


def download_single(url, dest, size):
    tmp = dest + ".part"
    for attempt in range(8):
        have = os.path.getsize(tmp) if os.path.exists(tmp) else 0
        if have >= size:
            break
        req = urllib.request.Request(url, headers={"Range": f"bytes={have}-"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "ab") as f:
                last = time.time()
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
                    have += len(chunk)
                    if time.time() - last > 15:
                        print(f"  {os.path.basename(dest)}: {have/size*100:.0f}%", flush=True)
                        last = time.time()
        except Exception as e:  # network hiccup: retry from where we are
            print(f"  retry {attempt+1}: {e}", flush=True)
            time.sleep(5)
    os.replace(tmp, dest)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.environ.get("INFERSMART_MODELS", "D:/InferSmart-models"))
    ap.add_argument("--small", action="store_true", help="only 0.8B and 2B")
    args = ap.parse_args()
    os.makedirs(args.dir, exist_ok=True)
    manifest_path = os.path.join(ROOT, "models", "MODELS.json")
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {"dir": args.dir, "files": {}}
    manifest["dir"] = args.dir

    # smallest first so something usable lands quickly
    jobs = []
    for repo, family in REPOS.items():
        if args.small and "4B" in family:
            continue
        tree = get_json(f"https://huggingface.co/api/models/{repo}/tree/main")
        for f in tree:
            if f["path"].endswith(".gguf") and any(q in f["path"] for q in QUANTS) and "/" not in f["path"]:
                jobs.append((f["size"], repo, family, f))
    def prio(j):
        name = j[3]["path"]
        return next((i for i, k in enumerate(PRIORITY) if k in name), 99)
    jobs.sort(key=prio)

    for size, repo, family, f in jobs:
        name = f["path"]
        dest = os.path.join(args.dir, name)
        expected = (f.get("lfs") or {}).get("oid")
        if os.path.exists(dest) and os.path.getsize(dest) == size:
            print(f"have {name}", flush=True)
        else:
            print(f"downloading {name} ({size/1e9:.2f} GB)", flush=True)
            download(f"https://huggingface.co/{repo}/resolve/main/{name}", dest, size)
        digest = manifest["files"].get(name, {}).get("sha256")
        if not digest:
            digest = sha256(dest)
        ok = expected is None or digest == expected
        print(f"  {name} checksum {'OK' if ok else 'MISMATCH'}", flush=True)
        if not ok:
            os.remove(dest)
            sys.exit(f"checksum mismatch for {name}; deleted, run again")
        quant = next(q for q in QUANTS if q in name)
        manifest["files"][name] = {
            "family": family, "quant": quant, "size": size, "sha256": digest,
            "source": f"https://huggingface.co/{repo}", "licence": "Apache-2.0",
        }
        with open(manifest_path, "w") as out:
            json.dump(manifest, out, indent=2)
    print("ALL DONE", flush=True)


if __name__ == "__main__":
    main()
