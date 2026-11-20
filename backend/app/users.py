"""Student accounts and their chats, stored only in the SQLite file on this school computer (data/aaroh.db).

- Passwords are stored as salted PBKDF2 hashes, never as text.
- Sessions are random tokens; only their SHA-256 hash is stored, so a copied database cannot be used to log in.
- Each student sees only their own chats. Nothing here is ever sent off this computer.
"""
from __future__ import annotations

import hashlib
import json
import re
import secrets
import time

from fastapi import Header, HTTPException, Request

from . import db
from .auth import _check, _hash

SESSION_DAYS = 30
MAX_TRIES, LOCK_SECONDS = 5, 300
MAX_CHATS, MAX_MSGS = 200, 120
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9_.]{2,23}$")
_fails: dict[str, list[float]] = {}

SCHEMA = """
CREATE TABLE IF NOT EXISTS student (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT, pw_hash TEXT NOT NULL,
    created REAL, last_login REAL);
CREATE TABLE IF NOT EXISTS student_session (token_hash TEXT PRIMARY KEY, student_id INTEGER NOT NULL, created REAL, expires REAL);
CREATE TABLE IF NOT EXISTS conversation (id TEXT NOT NULL, student_id INTEGER NOT NULL, title TEXT, created REAL, updated REAL,
    msgs TEXT, PRIMARY KEY (student_id, id));
CREATE INDEX IF NOT EXISTS conversation_by_student ON conversation(student_id, updated);
"""


def init() -> None:
    db.conn().executescript(SCHEMA)


def _th(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _public(u: dict) -> dict:
    return {"id": u["id"], "username": u["username"], "name": u.get("name") or u["username"]}


def _check_password(pw: str) -> None:
    if not (4 <= len(pw) <= 64):
        raise HTTPException(400, "The password must be 4 to 64 characters.")


def _new_session(student_id: int) -> str:
    tok = secrets.token_urlsafe(32)
    now = time.time()
    db.execute("INSERT INTO student_session(token_hash,student_id,created,expires) VALUES(?,?,?,?)",
               (_th(tok), student_id, now, now + SESSION_DAYS * 86400))
    db.execute("DELETE FROM student_session WHERE expires<?", (now,))
    return tok


def signup(username: str, password: str, name: str | None) -> tuple[str, dict]:
    username = (username or "").strip().lower()
    if not USERNAME_RE.match(username):
        raise HTTPException(400, "Choose a username of 3 to 24 letters or numbers (you may use . or _).")
    _check_password(password or "")
    if db.one("SELECT id FROM student WHERE username=?", (username,)):
        raise HTTPException(409, "That username is taken. Please choose another one.")
    name = (name or "").strip()[:40] or username
    sid = db.execute("INSERT INTO student(username,name,pw_hash,created,last_login) VALUES(?,?,?,?,?)",
                     (username, name, _hash(password), time.time(), time.time()))
    return _new_session(sid), {"id": sid, "username": username, "name": name}


def login(username: str, password: str, client: str) -> tuple[str, dict]:
    username = (username or "").strip().lower()
    key = f"{username}:{client}"
    f = _fails.get(key, [])
    if len(f) >= MAX_TRIES and time.time() - f[-1] < LOCK_SECONDS:
        raise HTTPException(429, "Too many wrong tries. Please wait about 5 minutes or ask the lab in-charge.")
    u = db.one("SELECT * FROM student WHERE username=?", (username,))
    if not u or not _check(password or "", u["pw_hash"]):
        _fails[key] = (f + [time.time()])[-MAX_TRIES:]
        raise HTTPException(401, "Username or password is not right.")
    _fails.pop(key, None)
    db.execute("UPDATE student SET last_login=? WHERE id=?", (time.time(), u["id"]))
    return _new_session(u["id"]), _public(u)


def logout(token: str | None) -> None:
    if token:
        db.execute("DELETE FROM student_session WHERE token_hash=?", (_th(token),))


def student_of(token: str | None) -> dict | None:
    if not token:
        return None
    s = db.one("SELECT student_id, expires FROM student_session WHERE token_hash=?", (_th(token),))
    if not s or s["expires"] < time.time():
        return None
    u = db.one("SELECT * FROM student WHERE id=?", (s["student_id"],))
    return _public(u) if u else None


def require_student(request: Request, x_user: str | None = Header(default=None)) -> dict:
    u = student_of(x_user)
    if not u:
        raise HTTPException(401, "Please log in.")
    request.state.student = u
    return u


# ------------------------------------------------------------------ chats
def _title(msgs: list) -> str:
    q = next((str(m.get("content", "")) for m in msgs if m.get("role") == "user"), "").strip()
    q = re.sub(r"\s+", " ", q) or "New chat"
    return q[:47] + "…" if len(q) > 48 else q


def list_chats(student_id: int) -> list[dict]:
    return db.query("SELECT id,title,created,updated FROM conversation WHERE student_id=? ORDER BY updated DESC LIMIT ?",
                    (student_id, MAX_CHATS))


def get_chat(student_id: int, cid: str) -> dict:
    c = db.one("SELECT * FROM conversation WHERE student_id=? AND id=?", (student_id, cid))
    if not c:
        raise HTTPException(404, "Chat not found.")
    c["msgs"] = db.jload(c["msgs"], [])
    return c


def save_chat(student_id: int, cid: str, msgs: list, touch: bool = True) -> dict:
    if not re.match(r"^[A-Za-z0-9_-]{4,40}$", cid or ""):
        raise HTTPException(400, "Bad chat id.")
    if not isinstance(msgs, list):
        raise HTTPException(400, "Bad messages.")
    keep = [{k: m.get(k) for k in ("role", "content", "lang", "blocked", "error", "stats") if m.get(k) is not None}
            for m in msgs[-MAX_MSGS:] if isinstance(m, dict) and m.get("role") in ("user", "assistant")]
    now = time.time()
    old = db.one("SELECT created, updated FROM conversation WHERE student_id=? AND id=?", (student_id, cid))
    updated = now if (touch or not old) else old["updated"]
    db.execute("INSERT OR REPLACE INTO conversation(id,student_id,title,created,updated,msgs) VALUES(?,?,?,?,?,?)",
               (cid, student_id, _title(keep), old["created"] if old else now, updated, json.dumps(keep, ensure_ascii=False)))
    # keep each student's history bounded
    db.execute("""DELETE FROM conversation WHERE student_id=? AND id NOT IN
                  (SELECT id FROM conversation WHERE student_id=? ORDER BY updated DESC LIMIT ?)""", (student_id, student_id, MAX_CHATS))
    return {"id": cid, "title": _title(keep), "updated": updated}


def delete_chat(student_id: int, cid: str | None = None) -> None:
    if cid:
        db.execute("DELETE FROM conversation WHERE student_id=? AND id=?", (student_id, cid))
    else:
        db.execute("DELETE FROM conversation WHERE student_id=?", (student_id,))


# ------------------------------------------------------------------ admin
def admin_list() -> list[dict]:
    return db.query("""SELECT s.id, s.username, s.name, s.created, s.last_login,
                       (SELECT COUNT(*) FROM conversation c WHERE c.student_id=s.id) AS chats
                       FROM student s ORDER BY s.username""")


def admin_reset_password(student_id: int) -> str:
    if not db.one("SELECT id FROM student WHERE id=?", (student_id,)):
        raise HTTPException(404, "Student not found.")
    temp = f"{secrets.randbelow(900000) + 100000}"
    db.execute("UPDATE student SET pw_hash=? WHERE id=?", (_hash(temp), student_id))
    db.execute("DELETE FROM student_session WHERE student_id=?", (student_id,))
    return temp


def delete_student(student_id: int) -> None:
    db.execute("DELETE FROM conversation WHERE student_id=?", (student_id,))
    db.execute("DELETE FROM student_session WHERE student_id=?", (student_id,))
    db.execute("DELETE FROM student WHERE id=?", (student_id,))


def change_password(student_id: int, old: str, new: str) -> None:
    u = db.one("SELECT * FROM student WHERE id=?", (student_id,))
    if not u or not _check(old or "", u["pw_hash"]):
        raise HTTPException(401, "The current password is not right.")
    _check_password(new or "")
    db.execute("UPDATE student SET pw_hash=? WHERE id=?", (_hash(new), student_id))
