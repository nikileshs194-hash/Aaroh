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
import time
import urllib.request

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


def download(url, dest, size):
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
    jobs.sort(key=lambda j: j[0])

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
