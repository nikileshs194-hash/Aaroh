"""Engine controller (M4): start, stop, restart llama.cpp servers; stream answers; watchdog (M12)."""
import asyncio
import json
import os
import subprocess
import time
from dataclasses import asdict, dataclass, field
from typing import AsyncIterator

import httpx
import psutil

from . import db
from .config import ENGINE_EXE, ENGINE_PORTS, LOG_DIR
from .events import bus, log_event


def _kv_mode() -> str:
    """'q8_0' (default, measured: same speed and accuracy, less memory) or 'f16' (llama.cpp default)."""
    try:
        return "f16" if db.get_setting("kv_cache") == "f16" else "q8_0"
    except Exception:
        return "q8_0"


@dataclass
class EngineConfig:
    model_file: str
    model_path: str
    threads: int
    ctx: int = 2048            # per slot
    batch: int = 512
    parallel: int = 1
    label: str = ""
    threads_batch: int = 0     # prompt reading; 0 = all logical CPUs (compute-bound, unlike writing)

    def key(self) -> str:
        return f"{self.model_file}|t{self.threads}|c{self.ctx}|b{self.batch}|p{self.parallel}"


@dataclass
class Engine:
    name: str
    port: int
    proc: subprocess.Popen | None = None
    config: EngineConfig | None = None
    wanted: bool = False          # should be running (watchdog restarts it)
    status: str = "stopped"       # stopped | starting | ready | crashed
    load_seconds: float | None = None
    started_at: float | None = None
    restarts: int = 0
    affinity: list[int] | None = None
    _log: object = field(default=None, repr=False)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def alive(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def pids(self) -> list[int]:
        return [self.proc.pid] if self.alive() else []

    def rss_gb(self) -> float:
        if not self.alive():
            return 0.0
        try:
            return psutil.Process(self.proc.pid).memory_info().rss / 1073741824
        except Exception:
            return 0.0

    def info(self) -> dict:
        return {
            "name": self.name, "port": self.port, "status": self.status,
            "config": asdict(self.config) if self.config else None,
            "load_seconds": self.load_seconds, "rss_gb": round(self.rss_gb(), 2),
            "restarts": self.restarts, "started_at": self.started_at,
        }

    async def start(self, cfg: EngineConfig, timeout: float = 240) -> float:
        await self.stop()
        if not ENGINE_EXE.exists():
            raise RuntimeError("The AI engine program is missing. Run the setup file again.")
        self.config = cfg
        self.status = "starting"
        args = [
            str(ENGINE_EXE), "-m", cfg.model_path,
            "--host", "127.0.0.1", "--port", str(self.port),
            "-c", str(cfg.ctx * cfg.parallel), "-np", str(cfg.parallel),
            "--jinja", "--chat-template-kwargs", '{"enable_thinking":false}',
            "--no-webui", "--metrics",
        ]
        # threads/batch of 0 mean "engine defaults" (used for the before-vs-after comparison)
        if cfg.threads > 0:
            tb = cfg.threads_batch or (len(self.affinity) if self.affinity else (psutil.cpu_count(logical=True) or cfg.threads))
            args += ["-t", str(cfg.threads), "-tb", str(tb)]
        if cfg.batch > 0:
            args += ["-b", str(cfg.batch), "-ub", str(min(cfg.batch, 512))]
        # From the CPU-inference paper (arXiv:2407.07304): keep the attention memory (KV cache) in 8-bit, which saves
        # memory without losing accuracy; flash attention is needed for that and was also measured faster here.
        # Engine-default runs (threads 0, the before-vs-after comparison) keep llama.cpp's own defaults.
        if cfg.threads > 0 and _kv_mode() == "q8_0":
            args += ["-fa", "on", "-ctk", "q8_0", "-ctv", "q8_0"]
        logf = open(LOG_DIR / f"engine_{self.name}.log", "ab")
        logf.write(f"\n==== {time.ctime()} start {' '.join(args)}\n".encode())
        logf.flush()
        self._log = logf
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        t0 = time.perf_counter()
        self.proc = subprocess.Popen(args, stdout=logf, stderr=subprocess.STDOUT, creationflags=flags)
        if self.affinity:
            try:
                psutil.Process(self.proc.pid).cpu_affinity(self.affinity)
            except Exception:
                pass
        self.wanted = True
        async with httpx.AsyncClient(timeout=2) as c:
            while time.perf_counter() - t0 < timeout:
                if not self.alive():
                    self.status = "crashed"
                    self.wanted = False
                    raise RuntimeError(f"The AI engine could not start with {cfg.model_file}. See data/logs/engine_{self.name}.log")
                try:
                    r = await c.get(self.url + "/health")
                    if r.status_code == 200:
                        self.load_seconds = round(time.perf_counter() - t0, 2)
                        self.started_at = time.time()
                        self.status = "ready"
                        bus.publish("engine", self.info())
                        return self.load_seconds
                except Exception:
                    pass
                await asyncio.sleep(0.3)
        await self.stop()
        raise RuntimeError("The AI engine took too long to start.")

    async def stop(self) -> None:
        self.wanted = False
        if self.proc is not None:
            if self.proc.poll() is None:
                self.proc.terminate()
                for _ in range(50):
                    if self.proc.poll() is not None:
                        break
                    await asyncio.sleep(0.1)
                if self.proc.poll() is None:
                    self.proc.kill()
            self.proc = None
        if self._log:
            try:
                self._log.close()
            except Exception:
                pass
            self._log = None
        if self.status != "stopped":
            self.status = "stopped"
            bus.publish("engine", self.info())


class EngineManager:
    def __init__(self) -> None:
        self.engines = {n: Engine(n, p) for n, p in ENGINE_PORTS.items()}
        self._watch_task: asyncio.Task | None = None

    def __getitem__(self, name: str) -> Engine:
        return self.engines[name]

    def all_pids(self) -> list[int]:
        pids = [os.getpid()]
        for e in self.engines.values():
            pids += e.pids()
        return pids

    def info(self) -> dict:
        return {n: e.info() for n, e in self.engines.items()}

    async def stop_all(self) -> None:
        for e in self.engines.values():
            await e.stop()

    def start_watchdog(self) -> None:
        if not self._watch_task:
            self._watch_task = asyncio.create_task(self._watchdog())

    async def _watchdog(self) -> None:
        """Restart a crashed engine with its last setting (F21)."""
        while True:
            await asyncio.sleep(2)
            for e in self.engines.values():
                if e.wanted and e.status == "ready" and not e.alive():
                    e.status = "crashed"
                    bus.publish("engine", e.info())
                    which = "quality" if e.name == "A" else "fast" if e.name == "B" else "test"
                    log_event("restart", f"The {which} AI engine stopped unexpectedly. Restarting now (about 20 seconds).")
                    try:
                        cfg = e.config
                        await e.start(cfg)
                        e.restarts += 1
                        log_event("restart", f"The {which} AI engine is running again after {e.load_seconds:.0f} s.")
                    except Exception as ex:
                        log_event("error", f"The {which} AI engine could not restart. Press Re-test in Settings if this repeats. ({ex})")


engines = EngineManager()


async def stream_chat(engine: Engine, messages: list[dict], max_tokens: int = 512,
                      temperature: float = 0.7, client: httpx.AsyncClient | None = None,
                      cancel: asyncio.Event | None = None) -> AsyncIterator[dict]:
    """Yield {'type':'token','text':..} for each piece, then {'type':'done', stats}.

    Stats: ttft (s), tps (tokens/s while writing), tokens, total (s)."""
    body = {
        "messages": messages, "stream": True, "max_tokens": max_tokens,
        "temperature": temperature, "top_p": 0.9,
        # Small models tend to loop, especially in Indian languages: discourage repeated phrases.
        "repeat_penalty": 1.1, "repeat_last_n": 256, "dry_multiplier": 0.8, "dry_base": 1.75, "dry_allowed_length": 3,
        "chat_template_kwargs": {"enable_thinking": False},
        "cache_prompt": True,
    }
    own = client is None
    c = client or httpx.AsyncClient(timeout=httpx.Timeout(600, connect=5))
    t0 = time.perf_counter()
    first = None
    tokens = 0
    timings = None
    finish = None
    try:
        async with c.stream("POST", engine.url + "/v1/chat/completions", json=body) as r:
            if r.status_code != 200:
                txt = (await r.aread()).decode(errors="ignore")[:300]
                raise RuntimeError(f"engine error {r.status_code}: {txt}")
            async for line in r.aiter_lines():
                if cancel is not None and cancel.is_set():
                    finish = "stopped"
                    break
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    j = json.loads(data)
                except Exception:
                    continue
                if j.get("timings"):
                    timings = j["timings"]
                for ch in j.get("choices", []):
                    piece = (ch.get("delta") or {}).get("content")
                    if piece:
                        if first is None:
                            first = time.perf_counter()
                        tokens += 1
                        yield {"type": "token", "text": piece}
                    if ch.get("finish_reason"):
                        finish = ch["finish_reason"]
    finally:
        if own:
            await c.aclose()
    end = time.perf_counter()
    ttft = (first - t0) if first else (end - t0)
    if timings and timings.get("predicted_per_second"):
        tps = float(timings["predicted_per_second"])
        tokens = int(timings.get("predicted_n", tokens))
    else:
        tps = (tokens - 1) / (end - first) if first and tokens > 1 and end > first else 0.0
    yield {"type": "done", "ttft": round(ttft, 3), "tps": round(tps, 2), "tokens": tokens,
           "total": round(end - t0, 3), "finish": finish,
           "prompt_tokens": (timings or {}).get("prompt_n"), "prompt_ms": (timings or {}).get("prompt_ms")}


async def complete(engine: Engine, messages: list[dict], max_tokens: int = 8, temperature: float = 0.0,
                   client: httpx.AsyncClient | None = None) -> str:
    body = {"messages": messages, "max_tokens": max_tokens, "temperature": temperature,
            "chat_template_kwargs": {"enable_thinking": False}, "cache_prompt": True}
    own = client is None
    c = client or httpx.AsyncClient(timeout=httpx.Timeout(600, connect=5))
    try:
        r = await c.post(engine.url + "/v1/chat/completions", json=body)
        r.raise_for_status()
        return r.json()["choices"][0]["message"].get("content") or ""
    finally:
        if own:
            await c.aclose()


def save_active(a: EngineConfig | None, b: EngineConfig | None, extra: dict | None = None) -> None:
    db.set_setting("active_config", {
        "A": asdict(a) if a else None, "B": asdict(b) if b else None, "saved_at": time.time(), **(extra or {})})


def load_active() -> tuple[EngineConfig | None, EngineConfig | None, dict]:
    v = db.get_setting("active_config") or {}
    a = EngineConfig(**v["A"]) if v.get("A") else None
    b = EngineConfig(**v["B"]) if v.get("B") else None
    return a, b, v
