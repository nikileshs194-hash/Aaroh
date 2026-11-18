"""Selection (D5.3): filter, score, weigh by goal, pick and explain. Pure functions, unit tested."""
from __future__ import annotations

GOAL_WEIGHTS = {
    "fast":     {"speed": 0.55, "quality": 0.15, "headroom": 0.15, "ttft": 0.15},
    "balanced": {"speed": 0.35, "quality": 0.35, "headroom": 0.15, "ttft": 0.15},
    "best":     {"speed": 0.15, "quality": 0.55, "headroom": 0.15, "ttft": 0.15},
}
GOAL_WORDS = {"fast": "fastest replies", "balanced": "balanced speed and quality", "best": "best answers"}


def _norm(vals: list[float], higher_better: bool = True, min_range: float = 0.0) -> list[float]:
    """Scale to 0..1. min_range stops tiny, meaningless differences from looking like the full range."""
    lo, hi = min(vals), max(vals)
    rng = max(hi - lo, min_range)
    if rng < 1e-9:
        return [1.0 for _ in vals]
    if higher_better:
        return [1.0 - (hi - v) / rng for v in vals]
    return [1.0 - (v - lo) / rng for v in vals]


def filter_settings(results: list[dict], budget_gb: float, min_tps: float) -> tuple[list[dict], list[dict]]:
    """Returns (kept, rejected). Each rejected item gets a plain 'why'."""
    kept, rejected = [], []
    for r in results:
        why = None
        if r.get("error"):
            why = "did not run on this computer"
        elif r.get("quality_pass") is False:
            why = "answer quality dropped too much"
        elif r["peak_mem_gb"] + 1.0 > budget_gb:
            why = "needs more memory than this computer can spare"
        elif r["tps"] < min_tps:
            why = f"writes slower than {min_tps:g} tokens/s even for one person"
        if why:
            rejected.append({**r, "rejected_why": why})
        else:
            kept.append(r)
    return kept, rejected


def score(results: list[dict], budget_gb: float, goal: str) -> list[dict]:
    if not results:
        return []
    w = GOAL_WEIGHTS.get(goal, GOAL_WEIGHTS["balanced"])
    tps = [r["tps"] for r in results]
    sp = _norm(tps, min_range=0.5 * max(tps))                       # <50 % speed gaps count proportionally less
    qs = [r.get("quality_score") if r.get("quality_score") is not None else 50.0 for r in results]
    ql = _norm(qs, min_range=10.0)                                  # 10 accuracy points = full range
    hr = [max(0.0, (budget_gb - r["peak_mem_gb"]) / budget_gb) for r in results]
    tt = _norm([r["ttft"] for r in results], higher_better=False, min_range=1.0)  # 1 s = full range
    out = []
    for i, r in enumerate(results):
        parts = {"speed": sp[i], "quality": ql[i], "headroom": hr[i], "ttft": tt[i]}
        s = sum(w[k] * parts[k] for k in w)
        out.append({**r, "score": round(s, 4), "score_parts": {k: round(v, 3) for k, v in parts.items()}})
    out.sort(key=lambda r: -r["score"])
    return out


def pick(scored: list[dict]) -> tuple[dict | None, dict | None]:
    if not scored:
        return None, None
    best, rest = scored[0], scored[1:]
    # If two are within 5 %, prefer the smaller memory use.
    for r in rest:
        if best["score"] > 0 and (best["score"] - r["score"]) / best["score"] <= 0.05 and r["peak_mem_gb"] < best["peak_mem_gb"] - 0.05:
            best = r
    runner = next((r for r in scored if r is not best), None)
    return best, runner


def pick_fast(kept: list[dict], rec: dict, budget_gb: float) -> dict | None:
    """Fastest passing setting that fits in memory alongside the recommendation (engine B).

    Prefers a different (lighter) model file; returns None if nothing fits."""
    cands = [r for r in kept if r["model_file"] != rec["model_file"]
             and rec["peak_mem_gb"] + r["peak_mem_gb"] + 1.0 <= budget_gb
             and r["tps"] > rec["tps"] * 1.15]
    if not cands:
        return None
    return max(cands, key=lambda r: r["tps"])


def reason(rec: dict, goal: str, langs: list[str], budget_gb: float, ref_note: str | None = None) -> str:
    lang_names = {"en": "English", "hi": "Hindi", "kn": "Kannada"}
    ln = " and ".join(lang_names.get(l, l) for l in langs) if langs else "English"
    spare = max(0.0, budget_gb - rec["peak_mem_gb"])
    if rec.get("quality_delta") is not None:
        q = f"kept answer quality within {abs(rec['quality_delta']):.0f} points of the best version in {ln}"
    else:
        q = f"passed the quality check in {ln}"
    lead = {"fast": "Fastest setting that", "best": "Highest-quality setting that",
            "balanced": "Best balance of speed and quality: it"}.get(goal, "It")
    return (f"{lead} {q}, writes about {rec['tps']:.0f} tokens a second, "
            f"and leaves {spare:.1f} GB memory free.")


def select(results: list[dict], budget_gb: float, goal: str, min_tps: float, langs: list[str]) -> dict:
    kept, rejected = filter_settings(results, budget_gb, min_tps)
    scored = score(kept, budget_gb, goal)
    rec, runner = pick(scored)
    fast = pick_fast(kept, rec, budget_gb) if rec else None
    fast_note = None
    if rec and not fast:
        fastest = max(kept, key=lambda r: r["tps"])
        fast_note = "already_fastest" if fastest["tps"] <= rec["tps"] * 1.15 else "no_memory"
    return {
        "fast_note": fast_note,
        "recommended": rec, "runner_up": runner, "fast": fast,
        "reason": reason(rec, goal, langs, budget_gb) if rec else
        "No setting met the comfort limits on this computer. Try the lightest model or lower the limits in Settings.",
        "scored": scored, "rejected": rejected, "goal": goal,
    }
