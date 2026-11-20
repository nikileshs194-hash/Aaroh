"""Network watcher and offline proof (D5.6, M11).

Every second, list the network connections opened by Aaroh's own programs and count any whose
remote address is outside the school's private network. The claim is "zero outside connections",
not "zero bytes"."""
from __future__ import annotations

import asyncio
import ipaddress
import socket
import time

import psutil

from . import db
from .engines import engines
from .events import bus, log_event


def is_inside(ip: str) -> bool:
    """True for this computer, the school's private network, link-local and multicast/broadcast."""
    try:
        a = ipaddress.ip_address(ip.split("%")[0])
    except ValueError:
        return False
    if isinstance(a, ipaddress.IPv6Address) and a.ipv4_mapped:
        a = a.ipv4_mapped
    if a.is_loopback or a.is_private or a.is_link_local or a.is_unspecified or a.is_multicast:
        return True
    if isinstance(a, ipaddress.IPv4Address) and (a in ipaddress.ip_network("100.64.0.0/10") or str(a) == "255.255.255.255"):
        return True  # carrier-grade NAT used by some phone hotspots
    return False


class Watcher:
    def __init__(self) -> None:
        self.started = time.time()
        self.outside_count = 0
        self.seen: set = set()
        self.selftest_caught = 0
        self.selftest_pending: set = set()
        self.last_tick = 0.0
        self.task: asyncio.Task | None = None

    def snapshot(self) -> dict:
        return {"outside_count": self.outside_count, "watching_since": self.started, "last_tick": self.last_tick,
                "selftest_caught": self.selftest_caught}

    def _scan(self) -> list[tuple]:
        found = []
        for pid in engines.all_pids():
            try:
                p = psutil.Process(pid)
                conns = p.net_connections(kind="inet")
                name = p.name()
            except Exception:
                continue
            for c in conns:
                if not c.raddr:
                    continue
                ip, port = c.raddr.ip, c.raddr.port
                if not is_inside(ip):
                    found.append((pid, name, ip, port, c.laddr.port if c.laddr else 0))
        return found

    async def loop(self) -> None:
        while True:
            try:
                found = await asyncio.to_thread(self._scan)
                for pid, name, ip, port, lport in found:
                    key = (pid, ip, port, lport)
                    if key in self.seen:
                        continue
                    self.seen.add(key)
                    remote = f"{ip}:{port}"
                    if (ip, port) in self.selftest_pending:
                        self.selftest_caught += 1
                        db.execute("INSERT INTO privacy_log(ts,kind,remote,process) VALUES(?,?,?,?)",
                                   (time.time(), "selftest", remote, name))
                        log_event("privacy", f"Watcher self-test: the deliberate outside connection to {remote} was caught.")
                    else:
                        self.outside_count += 1
                        db.execute("INSERT INTO privacy_log(ts,kind,remote,process) VALUES(?,?,?,?)",
                                   (time.time(), "outside", remote, name))
                        log_event("privacy", f"Outside connection detected: {name} connected to {remote}.")
                    bus.publish("privacy", self.snapshot())
                self.last_tick = time.time()
            except Exception:
                pass
            await asyncio.sleep(1)

    async def self_test(self, target: tuple[str, int] = ("1.1.1.1", 80)) -> dict:
        """Deliberately open one outside connection from this program and check the watcher catches it."""
        self.selftest_pending.add(target)
        before = self.selftest_caught
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setblocking(False)
        try:
            try:
                s.connect(target)
            except (BlockingIOError, OSError):
                pass  # connecting (or offline): the attempt still shows in the connection table
            for _ in range(40):
                await asyncio.sleep(0.1)
                if self.selftest_caught > before:
                    break
        finally:
            s.close()
            self.selftest_pending.discard(target)
        caught = self.selftest_caught > before
        if not caught:
            log_event("privacy", "Watcher self-test: the attempt ended before it could be seen (no network). Try again with Wi-Fi on.")
        return {"caught": caught, "target": f"{target[0]}:{target[1]}"}


watcher = Watcher()


def internet_reachable(timeout: float = 2.0) -> bool:
    for host in (("1.1.1.1", 53), ("8.8.8.8", 53)):
        try:
            with socket.create_connection(host, timeout=timeout):
                return True
        except OSError:
            continue
    return False


async def offline_check() -> dict:
    """Ask the AI a question and record whether internet was present. Passes when the answer arrives."""
    from .router import router
    internet = await asyncio.to_thread(internet_reachable)
    text, ok, err = "", False, None
    try:
        async for ev in router.chat([{"role": "user", "content": "In one sentence, what is a plant?"}],
                                    "offline-check", "teacher", 60):
            if ev["type"] == "token":
                text += ev["text"]
            elif ev["type"] == "done":
                ok = bool(text.strip())
            elif ev["type"] == "error":
                err = ev["message"]
    except Exception as ex:
        err = str(ex)
    detail = ("Chat worked with the internet disconnected." if ok and not internet else
              "Chat worked. The internet was connected during this check; turn Wi-Fi off for a full offline check." if ok else
              f"Chat did not answer: {err or 'no reply'}")
    passed = ok
    db.execute("INSERT INTO offline_check(ts,passed,internet,detail) VALUES(?,?,?,?)",
               (time.time(), int(passed), int(internet), detail))
    log_event("offline_check", ("Offline check passed. " if passed else "Offline check failed. ") + detail)
    return {"passed": passed, "internet": internet, "detail": detail, "ts": time.time()}


def report() -> dict:
    from .config import APP_VERSION, ENGINE_RELEASE
    checks = db.query("SELECT * FROM offline_check ORDER BY id DESC LIMIT 20")
    log = db.query("SELECT * FROM privacy_log ORDER BY id DESC LIMIT 50")
    return {
        "generated": time.time(),
        "watcher": watcher.snapshot(),
        "outside_total_all_time": db.one("SELECT COUNT(*) AS n FROM privacy_log WHERE kind='outside'")["n"],
        "offline_checks": checks,
        "privacy_log": log,
        "stored": [
            "Hardware details of this computer (processor, memory, disk)",
            "Test results: speed, memory and quality scores",
            "Settings, with the admin PIN stored only as a secure hash",
            "Student accounts: username, the name the student chose, password as a secure hash (never as text)",
            "Each student's chats, under their own account; only that student can see them, and they can delete them at any time",
            "Performance numbers per answer: time, speed, length",
            "The plain-language event log",
        ],
        "not_stored": [
            "Voice recordings (turned into text in memory, then discarded)",
            "Phone numbers, addresses, Aadhaar or any other personal documents (never asked for)",
            "Anything sent to the internet (outside connections are counted and should be zero)",
        ],
        "versions": {"Aaroh": APP_VERSION, "llama.cpp engine": ENGINE_RELEASE},
        "store_chats_setting": bool(db.get_setting("store_chats")),
        "note": "This report supports the school's own privacy compliance. It is not a legal certification.",
    }
