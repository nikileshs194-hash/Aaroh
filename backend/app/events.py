"""Live-update channel (server-sent events) and the plain-language event log."""
import asyncio
import json
import time
from typing import Any

from . import db


class Bus:
    def __init__(self) -> None:
        self._subs: set[asyncio.Queue] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._subs.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subs.discard(q)

    def publish(self, topic: str, data: Any) -> None:
        msg = json.dumps({"topic": topic, "data": data, "ts": time.time()})
        if self.loop and not self._in_loop():
            self.loop.call_soon_threadsafe(self._put_all, msg)
        else:
            self._put_all(msg)

    def _in_loop(self) -> bool:
        try:
            return asyncio.get_running_loop() is self.loop
        except RuntimeError:
            return False

    def _put_all(self, msg: str) -> None:
        for q in list(self._subs):
            if q.full():
                try:
                    q.get_nowait()
                except Exception:
                    pass
            try:
                q.put_nowait(msg)
            except Exception:
                pass


bus = Bus()


def log_event(type_: str, message: str, data: dict | None = None) -> dict:
    """Write one plain-language line to the event log and push it live.

    type_: switch | restart | error | offline_check | setup | test | info | privacy
    """
    ts = time.time()
    eid = db.execute("INSERT INTO event_log(ts,type,message,data) VALUES(?,?,?,?)",
                     (ts, type_, message, json.dumps(data or {})))
    ev = {"id": eid, "ts": ts, "type": type_, "message": message, "data": data or {}}
    bus.publish("event", ev)
    return ev


def recent_events(limit: int = 100, type_: str | None = None) -> list[dict]:
    if type_:
        rows = db.query("SELECT * FROM event_log WHERE type=? ORDER BY id DESC LIMIT ?", (type_, limit))
    else:
        rows = db.query("SELECT * FROM event_log ORDER BY id DESC LIMIT ?", (limit,))
    for r in rows:
        r["data"] = db.jload(r["data"], {})
    return rows
