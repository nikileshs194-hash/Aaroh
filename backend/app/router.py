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
        # in-flight requests, so the controller sees slowness while answers are still being written
        self.inflight: dict[int, dict] = {}

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
        """Devices that asked in the last minute or are still waiting for / reading an answer."""
        t = time.time()
        recent = {d for d, v in self.devices.items() if t - v <= window}
        recent |= {d for d, n in self.busy_dev.items() if n > 0 and d != "batch"}
        return len(recent)

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
        fl = {"t0": time.time(), "first": None, "tokens": 0, "kind": kind}
        self.inflight[rid] = fl
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
                    if ev["type"] == "token":
                        if fl["first"] is None:
                            fl["first"] = time.time()
                        fl["tokens"] += 1
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
            self.inflight.pop(rid, None)

    # ---------------------------------------------------------------- loops
    def observe(self) -> Obs:
        t = time.time()
        rec = [r for r in self.recent if t - r[0] <= 30 and r[4] != "batch"]
        ttfts = [r[1] for r in rec]
        tpss = [r[2] for r in rec]
        for f in list(self.inflight.values()):
            if f["kind"] == "batch":
                continue
            if f["first"] is None:
                ttfts.append(t - f["t0"])               # still waiting: counts as at least this long
            elif t - f["first"] > 2 and f["tokens"] > 3:
                tpss.append(f["tokens"] / (t - f["first"]))  # live writing speed of answers in progress
        vm = psutil.virtual_memory()
        return Obs(t=t, active=self.active, queued=len(self.waiting), users=self.users_now(),
                   ttft_p95=stats.percentile(ttfts, 95) if ttfts else None,
                   tps_med=stats.median(tpss) if tpss else None,
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


class ClassSimulator:
    """Virtual students sent through the real router, so the dashboard and controller react (demo, F6)."""
    QUESTIONS = [
        "What is photosynthesis? Explain simply.", "Why is the sky blue?", "What is the difference between mass and weight?",
        "Explain Ohm's law with an example.", "Give two examples of renewable energy in India.", "What causes the monsoon?",
        "ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ ಎಂದರೇನು? ಸರಳವಾಗಿ ವಿವರಿಸಿ.", "प्रकाश संश्लेषण क्या है? सरल शब्दों में समझाइए।",
    ]

    def __init__(self) -> None:
        self.task: asyncio.Task | None = None
        self.students = 0
        self.until = 0.0
        self.answers = 0

    def state(self) -> dict:
        return {"running": bool(self.task and not self.task.done()), "students": self.students,
                "seconds_left": max(0, round(self.until - time.time())), "answers": self.answers}

    async def _student(self, i: int, stop_at: float) -> None:
        import random
        from .safety import SYSTEM_PROMPT
        await asyncio.sleep(random.uniform(0, 4))
        while time.time() < stop_at:
            q = random.choice(self.QUESTIONS)
            msgs = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": q}]
            async for ev in router.chat(msgs, f"sim-{i}", "student", 220):
                if ev["type"] == "done":
                    self.answers += 1
            await asyncio.sleep(random.uniform(3, 10))

    async def _run(self, n: int, seconds: int) -> None:
        stop_at = time.time() + seconds
        log_event("info", f"Simulating {n} students for {seconds} s (virtual students, clearly a simulation).")
        await asyncio.gather(*(self._student(i, stop_at) for i in range(n)))
        log_event("info", f"Student simulation finished: {self.answers} answers given.")
        self.students = 0

    def start(self, n: int, seconds: int) -> dict:
        if self.task and not self.task.done():
            self.task.cancel()
        self.students, self.answers, self.until = n, 0, time.time() + seconds
        self.task = asyncio.create_task(self._run(n, seconds))
        return self.state()

    def stop(self) -> dict:
        if self.task and not self.task.done():
            self.task.cancel()
            log_event("info", "Student simulation stopped by the admin.")
        self.students, self.until = 0, 0
        return self.state()


router = Router()
classsim = ClassSimulator()
