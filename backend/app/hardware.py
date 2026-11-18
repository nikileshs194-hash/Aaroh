"""Hardware scanner and Hardware Passport (M3), with the classroom PC simulator."""
import hashlib
import json
import os
import platform
import shutil
import time

import psutil

from . import db
from .config import OS_RESERVE_GB, ROOT

_cpu_cache: dict | None = None


def _cpu_info() -> dict:
    global _cpu_cache
    if _cpu_cache is None:
        try:
            import cpuinfo  # py-cpuinfo; slow (~1 s), so cached
            info = cpuinfo.get_cpu_info()
        except Exception:
            info = {}
        flags = set(info.get("flags", []))
        name = info.get("brand_raw") or platform.processor() or "Unknown processor"
        _cpu_cache = {
            "name": " ".join(name.replace("(R)", "").replace("(TM)", "").split()),
            "arch": info.get("arch", platform.machine()),
            "avx2": "avx2" in flags,
            "avx512": any(f.startswith("avx512") for f in flags),
            "neon": "neon" in flags or "asimd" in flags,
        }
    return _cpu_cache


def _os_name() -> str:
    if os.name == "nt":
        try:
            build = int(platform.version().split(".")[-1])
        except Exception:
            build = 0
        return f"Windows {'11' if build >= 22000 else platform.release()}"
    try:
        import distro  # type: ignore
        return f"{distro.name()} {distro.version()}"
    except Exception:
        return f"{platform.system()} {platform.release()}"


def simulator() -> dict:
    return db.get_setting("simulator") or {"enabled": False}


def classify(cores: int, mem_gb: float) -> str:
    if cores <= 4 or mem_gb < 7.5:
        return "entry"
    if cores <= 8 or mem_gb < 15:
        return "standard"
    return "strong"


def max_params_b(budget_gb: float) -> float:
    """Largest model (billions of parameters) that fits comfortably at 4-bit.

    ~0.7 GB per billion parameters at Q4_K_M including runtime overhead, keeping 1 GB spare."""
    return max(0.0, round((budget_gb - 1.0) / 0.7, 1))


def scan() -> dict:
    cpu = _cpu_info()
    vm = psutil.virtual_memory()
    phys = psutil.cpu_count(logical=False) or 1
    logical = psutil.cpu_count(logical=True) or phys
    disk = shutil.disk_usage(str(ROOT))
    real = {
        "cpu": cpu["name"],
        "arch": cpu["arch"],
        "cores": phys,
        "threads": logical,
        "mem_total_gb": round(vm.total / 1073741824, 1),
        "mem_free_gb": round(vm.available / 1073741824, 1),
        "disk_free_gb": round(disk.free / 1073741824, 1),
        "os": _os_name(),
        "avx2": cpu["avx2"],
        "avx512": cpu["avx512"],
        "neon": cpu["neon"],
    }
    try:
        batt = psutil.sensors_battery()
        real["on_battery"] = bool(batt and not batt.power_plugged)
        real["has_battery"] = batt is not None
    except Exception:
        real["on_battery"] = False
        real["has_battery"] = False

    sim = simulator()
    p = dict(real)
    p["simulated"] = bool(sim.get("enabled"))
    if p["simulated"]:
        p["cores"] = min(real["cores"], int(sim.get("cores", 4)))
        p["threads"] = min(real["threads"], p["cores"] * 2)
        p["mem_total_gb"] = min(real["mem_total_gb"], float(sim.get("mem_gb", 8)))
        p["mem_free_gb"] = min(real["mem_free_gb"], p["mem_total_gb"])
        p["real"] = {k: real[k] for k in ("cores", "threads", "mem_total_gb")}
    p["mem_budget_gb"] = round(max(0.5, p["mem_total_gb"] - OS_RESERVE_GB), 1)
    p["class"] = classify(p["cores"], p["mem_total_gb"])
    # memory limit, and a processor-speed limit so the promise stays usable on a CPU
    p["max_params_b"] = min(max_params_b(p["mem_budget_gb"]), {"entry": 2.0, "standard": 4.0, "strong": 8.0}[p["class"]])
    p["passport_id"] = passport_id(real)
    p["scanned_at"] = time.time()
    return p


def passport_id(real: dict) -> str:
    h = hashlib.sha1(f"{real['cpu']}|{real['cores']}|{round(real['mem_total_gb'])}|{platform.node()}".encode()).hexdigest().upper()
    return f"{h[:4]}-{h[4:6]}"


def scan_and_save() -> dict:
    p = scan()
    db.execute("INSERT INTO hardware_profile(ts,data) VALUES(?,?)", (time.time(), json.dumps(p)))
    return p


def cpu_affinity_for(cores: int) -> list[int] | None:
    """When the simulator is on, pin engines to the first N logical CPUs so the limit is real."""
    sim = simulator()
    if not sim.get("enabled"):
        return None
    total = psutil.cpu_count(logical=True) or 1
    n = max(1, min(total, int(sim.get("cores", cores))))
    return list(range(n))


def usable_threads() -> int:
    p = scan_light()
    return p["cores"]


def scan_light() -> dict:
    """Cheap version used often: no cpuinfo flags call after first time."""
    return scan()
