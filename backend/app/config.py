"""Paths and fixed constants for the Aaroh control centre."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENGINE_DIR = ROOT / "engine" / "bin"
ENGINE_EXE = ENGINE_DIR / ("llama-server.exe" if os.name == "nt" else "llama-server")
ENGINE_RELEASE = "b12521"
DATA_DIR = ROOT / "data"
LOG_DIR = DATA_DIR / "logs"
DB_PATH = Path(os.environ.get("INFERSMART_DB", DATA_DIR / "infersmart.db"))
TESTSET_PATH = DATA_DIR / "testsets" / "quality_sets.json"
FRONTEND_DIST = ROOT / "frontend" / "dist"
MODEL_MANIFEST = ROOT / "models" / "MODELS.json"

APP_HOST = os.environ.get("INFERSMART_HOST", "0.0.0.0")
APP_PORT = int(os.environ.get("INFERSMART_PORT", "8080"))
ENGINE_PORTS = {"A": 8091, "B": 8092, "T": 8093, "K": 8094}  # A main, B fast, T test runner, K Kannada
APP_VERSION = "1.0.0"

# Memory kept back for the operating system, the browser and the control centre.
OS_RESERVE_GB = 2.5


def model_dirs() -> list[Path]:
    dirs = []
    env = os.environ.get("INFERSMART_MODELS")
    if env:
        dirs.append(Path(env))
    if MODEL_MANIFEST.exists():
        try:
            dirs.append(Path(json.loads(MODEL_MANIFEST.read_text())["dir"]))
        except Exception:
            pass
    dirs.append(ROOT / "models")
    dirs.append(Path("D:/InferSmart-models"))
    seen, out = set(), []
    for d in dirs:
        key = str(d.resolve()).lower() if d.exists() else str(d).lower()
        if key not in seen and d.exists():
            seen.add(key)
            out.append(d)
    return out


for d in (DATA_DIR, LOG_DIR):
    d.mkdir(parents=True, exist_ok=True)
