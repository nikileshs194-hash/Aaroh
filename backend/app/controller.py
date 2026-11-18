"""Load-adaptive controller (D5.5): observe -> decide -> act -> explain.

decide() is a pure function so its behaviour is predictable and unit tested."""
from __future__ import annotations

from dataclasses import dataclass, field

MODES = ["quality", "fast", "protect"]
BREAK_HOLD_S = 20.0   # limits broken this long -> move one mode right
CALM_HOLD_S = 60.0    # calm this long -> move one mode left


@dataclass
class Obs:
    t: float
    active: int            # answers being written now
    queued: int            # questions waiting
    users: int             # devices active in the last 60 s
    ttft_p95: float | None  # slow-case first word over the last 30 s
    tps_med: float | None  # typical writing speed per answer over the last 30 s
    free_mem_gb: float


@dataclass
class CState:
    mode: str = "quality"
    broken_since: float | None = None
    calm_since: float | None = None
    last_switch: float = 0.0
    history: list = field(default_factory=list)


def limits_broken(o: Obs, max_ttft: float, min_tps: float) -> str | None:
    if o.ttft_p95 is not None and o.ttft_p95 > max_ttft:
        return f"first word reached {o.ttft_p95:.0f} s (limit {max_ttft:g} s)"
    if o.tps_med is not None and o.active > 0 and o.tps_med < min_tps:
        return f"writing speed fell to {o.tps_med:.1f} per second (limit {min_tps:g})"
    return None


def is_calm(o: Obs, max_ttft: float, capacity: int | None) -> bool:
    if o.queued > 0:
        return False
    if o.ttft_p95 is not None and o.ttft_p95 > max_ttft * 0.6:
        return False
    if capacity and o.users > max(1, capacity):
        return False
    return o.free_mem_gb >= 0.5


def decide(st: CState, o: Obs, max_ttft: float, min_tps: float, capacity: int | None,
           lock: str | None = None, has_fast_engine: bool = True) -> tuple[str, str | None]:
    """Returns (new_mode, plain-language reason or None if unchanged). Mutates st timers."""
    if lock in MODES:
        if st.mode != lock:
            old = st.mode
            st.mode, st.broken_since, st.calm_since, st.last_switch = lock, None, None, o.t
            return lock, f"Mode locked to {lock} by the admin (was {old})."
        return st.mode, None

    broken = limits_broken(o, max_ttft, min_tps)
    calm = (not broken) and is_calm(o, max_ttft, capacity)

    if broken:
        st.calm_since = None
        if st.broken_since is None:
            st.broken_since = o.t
    else:
        st.broken_since = None
    if calm:
        if st.calm_since is None:
            st.calm_since = o.t
    else:
        st.calm_since = None

    idx = MODES.index(st.mode)
    if broken and st.broken_since is not None and o.t - st.broken_since >= BREAK_HOLD_S and idx < len(MODES) - 1:
        new = MODES[idx + 1]
        st.mode, st.broken_since, st.last_switch = new, None, o.t
        who = f"{o.users} users are active" if o.users != 1 else "1 user is active"
        if new == "fast":
            what = "Switched to fast model" if has_fast_engine else "Switched to fast mode (shorter answers)"
        else:
            what = "Switched to protect mode: shorter answers and a fair queue"
        return new, f"{what} because {who} and {broken}."
    if calm and st.calm_since is not None and o.t - st.calm_since >= CALM_HOLD_S and idx > 0:
        new = MODES[idx - 1]
        st.mode, st.calm_since, st.last_switch = new, None, o.t
        back = "Back to quality model" if new == "quality" else "Back to fast mode"
        return new, f"{back}: quiet for {CALM_HOLD_S:.0f} s."
    return st.mode, None
