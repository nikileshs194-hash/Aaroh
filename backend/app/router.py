"""Request router, fair queue (F16), load-adaptive switching loop (F15) and live metrics (F17)."""
from __future__ import annotations

import asyncio
import collections
import itertools
import time
from typing import AsyncIterator

import httpx
import psutil

from . import db, stats
from .controller import CState, Obs, decide
from .engines import engines, stream_chat
from .events import bus, log_event

RATE_PER_MIN = 8


class Router:
    def __init__(self) -> None:
        self.sems: dict[str, asyncio.Semaphore] = {}
        self.slots: dict[str, int] = {}
        self.waiting: list[int] = []
        self.active = 0
        self.active_by_kind = collections.Counter()
        self.recent: collections.deque = collections.deque(maxlen=2000)  # (t, ttft, tps, engine, kind)
        self.devices: dict[str, float] = {}
        self.rate: dict[str, collections.deque] = collections.defaultdict(lambda: collections.deque(maxlen=50))
        self.busy_dev: collections.Counter = collections.Counter()
        self.cstate = CState()
        self.ids = itertools.count(1)
        self.history: collections.deque = collections.deque(maxlen=300)
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(900, connect=5), limits=httpx.Limits(max_connections=64))
        self.last_student_activity = 0.0
        self.tokens_total = 0

    # ---------------------------------------------------------------- helpers
    def _sem(self, name: str) -> asyncio.Semaphore:
        e = engines[name]
        slots = e.config.parallel if e.config else 1
        if self.slots.get(name) != slots:
            self.sems[name] = asyncio.Semaphore(slots)
            self.slots[name] = slots
        return self.sems[name]

    def mode(self) -> str:
        return self.cstate.mode

    def users_now(self, window: float = 60) -> int:
        t = time.time()
        return sum(1 for v in self.devices.values() if t - v <= window)

    def avg_answer_s(self) -> float:
        t = time.time()
        recs = [r for r in self.recent if t - r[0] < 300 and r[5]]
        return stats.median([r[5] for r in recs]) or 12.0

    def pick_engine(self, kind: str) -> tuple[str | None, int | None]:
        """Returns (engine name, max-token cap for this mode)."""
        a_ok = engines["A"].status == "ready"
        b_ok = engines["B"].status == "ready"
        m = self.cstate.mode
        if m == "quality":
            return ("A" if a_ok else "B" if b_ok else None), None
        if m == "fast":
            if b_ok:
                return "B", None
            return ("A" if a_ok else None), 300  # same engine, shorter answers
        # protect
        return ("B" if b_ok else "A" if a_ok else None), 200 if kind == "student" else 400

    def rate_limited(self, device: str, kind: str) -> bool:
        if kind != "student":
            return False
        q = self.rate[device]
        t = time.time()
        while q and t - q[0] > 60:
            q.popleft()
        if len(q) >= RATE_PER_MIN or self.busy_dev[device] >= 1:
            return True
        q.append(t)
        return False

    # ---------------------------------------------------------------- chat
    async def chat(self, messages: list[dict], device: str, kind: str = "student", max_tokens: int = 600,
                   cancel: asyncio.Event | None = None) -> AsyncIterator[dict]:
        self.devices[device] = time.time()
        if kind == "student":
            self.last_student_activity = time.time()
        if self.rate_limited(device, kind):
            yield {"type": "error", "code": "rate", "message": "Please wait for your current answer to finish, then ask again."}
            return
        name, cap = self.pick_engine(kind)
        if name is None:
            yield {"type": "error", "code": "engine", "message": "The AI engine is starting. Please try again in about 20 seconds."}
            return
        if cap:
            max_tokens = min(max_tokens, cap)
        rid = next(self.ids)
        sem = self._sem(name)
        self.busy_dev[device] += 1
        t_req = time.perf_counter()
        try:
            if sem.locked():
                self.waiting.append(rid)
                try:
                    acquired = asyncio.create_task(sem.acquire())
                    while not acquired.done():
                        pos = self.waiting.index(rid) + 1 if rid in self.waiting else 1
                        eta = round(pos * self.avg_answer_s() / max(1, self.slots.get(name, 1)))
                        yield {"type": "queue", "position": pos, "eta_s": max(3, eta)}
                        try:
                            await asyncio.wait_for(asyncio.shield(acquired), timeout=2)
                        except asyncio.TimeoutError:
                            pass
                        if cancel is not None and cancel.is_set():
                            acquired.cancel()
                            return
                finally:
                    if rid in self.waiting:
                        self.waiting.remove(rid)
            else:
                await sem.acquire()
            self.active += 1
            self.active_by_kind[kind] += 1
            yield {"type": "start", "engine": name, "mode": self.cstate.mode,
                   "model": engines[name].config.model_file if engines[name].config else None}
            try:
                async for ev in stream_chat(engines[name], messages, max_tokens, 0.6, self.client, cancel):
                    if ev["type"] == "done":
                        waited = time.perf_counter() - t_req
                        ttft = round(waited - ev["total"] + ev["ttft"], 3)  # includes time spent in our queue
                        ev = {**ev, "ttft": ttft, "engine": name, "mode": self.cstate.mode}
                        self.recent.append((time.time(), ttft, ev["tps"], name, kind, ev["total"]))
                        self.tokens_total += ev["tokens"]
                        db.execute("INSERT INTO perf_log(ts,engine,mode,ttft,tps,tokens,kind) VALUES(?,?,?,?,?,?,?)",
                                   (time.time(), name, self.cstate.mode, ttft, ev["tps"], ev["tokens"], kind))
                    yield ev
            except Exception as ex:
                yield {"type": "error", "code": "engine",
                       "message": "The AI stopped unexpectedly. Restarting (about 20 seconds). If this repeats, press Re-test.",
                       "detail": str(ex)[:200]}
            finally:
                self.active -= 1
                self.active_by_kind[kind] -= 1
                sem.release()
        finally:
            self.busy_dev[device] -= 1

    # ---------------------------------------------------------------- loops
    def observe(self) -> Obs:
        t = time.time()
        rec = [r for r in self.recent if t - r[0] <= 30 and r[4] != "batch"]
        vm = psutil.virtual_memory()
        return Obs(t=t, active=self.active, queued=len(self.waiting), users=self.users_now(),
                   ttft_p95=stats.percentile([r[1] for r in rec], 95) if rec else None,
                   tps_med=stats.median([r[2] for r in rec]) if rec else None,
                   free_mem_gb=vm.available / 1073741824)

    async def control_loop(self) -> None:
        while True:
            await asyncio.sleep(2)
            try:
                o = self.observe()
                active_cfg = db.get_setting("active_config") or {}
                new, why = decide(self.cstate, o, float(db.get_setting("max_ttft")), float(db.get_setting("min_tps")),
                                  active_cfg.get("capacity_n"), db.get_setting("lock_mode"),
                                  has_fast_engine=engines["B"].status == "ready")
                if why:
                    log_event("switch", why, {"mode": new, "users": o.users, "ttft_p95": o.ttft_p95, "tps_med": o.tps_med})
                    bus.publish("mode", {"mode": new})
            except Exception as ex:
                log_event("error", f"Load controller problem: {ex}")

    async def metrics_loop(self) -> None:
        psutil.cpu_percent(interval=None)
        while True:
            await asyncio.sleep(1)
            o = self.observe()
            vm = psutil.virtual_memory()
            point = {
                "t": o.t, "cpu": psutil.cpu_percent(interval=None),
                "mem_used_gb": round((vm.total - vm.available) / 1073741824, 2), "mem_total_gb": round(vm.total / 1073741824, 1),
                "users": o.users, "active": o.active, "queued": o.queued,
                "ttft_p95": round(o.ttft_p95, 2) if o.ttft_p95 is not None else None,
                "tps_med": round(o.tps_med, 1) if o.tps_med is not None else None,
                "mode": self.cstate.mode,
                "engines": {n: {"status": e.status, "rss_gb": round(e.rss_gb(), 2),
                                "model": e.config.model_file if e.config else None} for n, e in engines.engines.items()},
            }
            self.history.append(point)
            bus.publish("live", point)


router = Router()
