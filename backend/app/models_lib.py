"""Model library (F3): GGUF files on disk, their size, family, quality level and memory need."""
import json
import os
import re
from pathlib import Path

from .config import MODEL_MANIFEST, model_dirs

QUANT_LABEL = {"Q4_K_M": "light", "Q5_K_M": "balanced", "Q8_0": "reference"}
QUANT_ORDER = {"Q4_K_M": 0, "Q5_K_M": 1, "Q8_0": 2}
LANGS = {"Qwen3.5": ["en", "hi", "kn"], "Qwen2.5": ["en", "hi", "kn"], "gemma": ["en", "hi", "kn"], "Llama": ["en", "hi"]}

_PAT = re.compile(r"(?P<family>.+?)-(?P<params>\d+(?:\.\d+)?)B.*?(?P<quant>Q\d_K_[MS]|Q\d_0|F16|BF16)", re.I)


def manifest() -> dict:
    if MODEL_MANIFEST.exists():
        try:
            return json.loads(MODEL_MANIFEST.read_text())
        except Exception:
            pass
    return {"files": {}}


def parse(name: str) -> dict:
    m = _PAT.search(name)
    if not m:
        return {"family": Path(name).stem, "params_b": 0.0, "quant": "?"}
    return {"family": m.group("family"), "params_b": float(m.group("params")), "quant": m.group("quant").upper()}


def est_memory_gb(size_bytes: int, ctx_tokens: int = 8192) -> float:
    """Weights plus runtime buffers and a context cache allowance."""
    return round(size_bytes / 1073741824 * 1.08 + 0.25 + ctx_tokens / 8192 * 0.25, 2)


def list_models(budget_gb: float | None = None) -> list[dict]:
    man = manifest().get("files", {})
    out, seen = [], set()
    for d in model_dirs():
        for p in sorted(d.glob("*.gguf")):
            if p.name in seen or p.name.startswith("mmproj"):
                continue
            seen.add(p.name)
            info = parse(p.name)
            size = p.stat().st_size
            rec = man.get(p.name, {})
            m = {
                "file": p.name,
                "path": str(p),
                "size_gb": round(size / 1073741824, 2),
                "family": info["family"],
                "params_b": info["params_b"],
                "quant": info["quant"],
                "quality_label": QUANT_LABEL.get(info["quant"], info["quant"]),
                "name": f"{info['family']} {fmt_params(info['params_b'])}",
                "est_mem_gb": est_memory_gb(size),
                "languages": LANGS.get(info["family"].split("-")[0], ["en"]),
                "licence": rec.get("licence", "see model page"),
                "source": rec.get("source", ""),
                "checksum_recorded": bool(rec.get("sha256")),
                "size_matches_record": (rec.get("size") == size) if rec else None,
            }
            if budget_gb is not None:
                m["fits"] = m["est_mem_gb"] + 1.0 <= budget_gb
            out.append(m)
    out.sort(key=lambda m: (m["params_b"], QUANT_ORDER.get(m["quant"], 9)))
    return out


def fmt_params(p: float) -> str:
    return f"{p:g}B"


def find(file: str) -> dict | None:
    for m in list_models():
        if m["file"] == file:
            return m
    return None


def reference_for(m: dict, models: list[dict]) -> dict | None:
    """The Q8_0 (8-bit) file of the same family and size, used as the quality reference."""
    for x in models:
        if x["family"] == m["family"] and x["params_b"] == m["params_b"] and x["quant"] == "Q8_0":
            return x
    return None


def verify_checksum(file: str) -> dict:
    import hashlib
    m = find(file)
    if not m:
        return {"ok": False, "reason": "not found"}
    rec = manifest().get("files", {}).get(file)
    if not rec or not rec.get("sha256"):
        return {"ok": None, "reason": "no recorded checksum"}
    h = hashlib.sha256()
    with open(m["path"], "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    ok = h.hexdigest() == rec["sha256"]
    return {"ok": ok, "reason": "matches the official file" if ok else "file has changed since download"}
