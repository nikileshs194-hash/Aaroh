"""Small statistics helpers (median, percentile, noise)."""
from __future__ import annotations

import statistics


def median(xs: list[float]) -> float | None:
    xs = [x for x in xs if x is not None]
    return float(statistics.median(xs)) if xs else None


def percentile(xs: list[float], p: float) -> float | None:
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    if len(xs) == 1:
        return float(xs[0])
    k = (len(xs) - 1) * p / 100.0
    lo, hi = int(k), min(int(k) + 1, len(xs) - 1)
    return float(xs[lo] + (xs[hi] - xs[lo]) * (k - lo))


def spread(xs: list[float]) -> float:
    """(max - min) / median; > 0.10 means the runs disagree ('noisy')."""
    xs = [x for x in xs if x]
    if len(xs) < 2:
        return 0.0
    m = statistics.median(xs)
    return (max(xs) - min(xs)) / m if m else 0.0


def capacity_n(steps: list[dict], min_tps: float, max_ttft: float) -> int:
    """Largest student count where every step up to it met both comfort limits."""
    n = 0
    for s in sorted(steps, key=lambda s: s["students"]):
        ok = (s.get("tps_med") or 0) >= min_tps and (s.get("ttft_p95") if s.get("ttft_p95") is not None else 1e9) <= max_ttft
        if not ok:
            break
        n = s["students"]
    return n
