"""Single-file SQLite database (D7). No question or answer text from students is ever stored."""
import json
import sqlite3
import threading
import time
from typing import Any

from .config import DB_PATH

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS hardware_profile (id INTEGER PRIMARY KEY, ts REAL, data TEXT);
CREATE TABLE IF NOT EXISTS test_run (id INTEGER PRIMARY KEY, ts REAL, goal TEXT, status TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS test_result (id INTEGER PRIMARY KEY, run_id INTEGER, key TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS quality_result (model_file TEXT, n INTEGER, ts REAL, data TEXT, PRIMARY KEY(model_file, n));
CREATE TABLE IF NOT EXISTS capacity_result (id INTEGER PRIMARY KEY, run_id INTEGER, ts REAL, data TEXT);
CREATE TABLE IF NOT EXISTS event_log (id INTEGER PRIMARY KEY, ts REAL, type TEXT, message TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS perf_log (id INTEGER PRIMARY KEY, ts REAL, engine TEXT, mode TEXT, ttft REAL, tps REAL, tokens INTEGER, kind TEXT);
CREATE TABLE IF NOT EXISTS library_item (id INTEGER PRIMARY KEY, created REAL, updated REAL, template TEXT, fields TEXT,
    language TEXT, title TEXT, body TEXT, reviewed INTEGER DEFAULT 0, shared INTEGER DEFAULT 0, author TEXT);
CREATE TABLE IF NOT EXISTS batch_job (id INTEGER PRIMARY KEY, created REAL, status TEXT, label TEXT, request TEXT, item_id INTEGER, error TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS privacy_log (id INTEGER PRIMARY KEY, ts REAL, kind TEXT, remote TEXT, process TEXT);
CREATE TABLE IF NOT EXISTS offline_check (id INTEGER PRIMARY KEY, ts REAL, passed INTEGER, internet INTEGER, detail TEXT);
CREATE TABLE IF NOT EXISTS rating (id INTEGER PRIMARY KEY, ts REAL, model TEXT, prompt_id TEXT, correctness INTEGER, clarity INTEGER, suitability INTEGER, rater TEXT);
CREATE TABLE IF NOT EXISTS report (id INTEGER PRIMARY KEY, ts REAL, category TEXT, language TEXT);
"""


def conn() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
            _conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, isolation_level=None)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.executescript(SCHEMA)
        return _conn


def execute(sql: str, params: tuple = ()) -> int:
    with _lock:
        cur = conn().execute(sql, params)
        return cur.lastrowid


def query(sql: str, params: tuple = ()) -> list[dict]:
    with _lock:
        return [dict(r) for r in conn().execute(sql, params).fetchall()]


def one(sql: str, params: tuple = ()) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None


def jload(s: str | None, default: Any = None) -> Any:
    if s is None:
        return default
    try:
        return json.loads(s)
    except Exception:
        return default


# ---- settings (key/value JSON) ----
DEFAULTS: dict[str, Any] = {
    "min_tps": 5.0,            # comfort: writing speed per student (tokens/s)
    "max_ttft": 3.0,           # comfort: slow-case time to first word (s)
    "quality_margin": 3.0,     # percentage points below the 8-bit reference
    "quality_floor": 35.0,     # minimum accuracy % (chance is 25 %)
    "quality_n": 40,           # questions per language
    "goal": "balanced",
    "class_size": "class",
    "languages": ["en", "kn"],
    "theme": "light",
    "text_size": 100,
    "ui_language": "en",
    "autostart": True,
    "lock_mode": None,         # None | quality | fast | protect
    "exam_mode": False,
    "store_chats": False,      # never on the server; shown in privacy report
    "school_name": "",
    "simulator": {"enabled": False, "cores": 4, "mem_gb": 8},
    "blocked_topics": [],
    "setup_done": False,
    "setup_step": "welcome",
    "slots": 4,
    "ctx_per_slot": 3072,
    "batch_pause_when_busy": True,
    "wifi_name": "School Wi-Fi",
}


def get_setting(key: str) -> Any:
    row = one("SELECT value FROM settings WHERE key=?", (key,))
    if row is None:
        return DEFAULTS.get(key)
    return jload(row["value"], DEFAULTS.get(key))


def set_setting(key: str, value: Any) -> None:
    execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, json.dumps(value)))


def all_settings() -> dict:
    out = dict(DEFAULTS)
    for r in query("SELECT key, value FROM settings"):
        out[r["key"]] = jload(r["value"])
    return out


def now() -> float:
    return time.time()
