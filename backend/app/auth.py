"""Admin PIN and teacher code (F20). Classroom-grade protection, not bank-grade, and we say so."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time

from fastapi import Header, HTTPException, Request

from . import db

TOKEN_TTL = 12 * 3600
MAX_TRIES = 5
LOCK_SECONDS = 300
_tokens: dict[str, tuple[str, float]] = {}
_fails: dict[str, list] = {}


def _hash(secret: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    h = hashlib.pbkdf2_hmac("sha256", secret.encode(), salt, 120_000)
    return salt.hex() + ":" + h.hex()


def _check(secret: str, stored: str | None) -> bool:
    if not stored or ":" not in stored:
        return False
    salt, h = stored.split(":", 1)
    return hmac.compare_digest(_hash(secret, bytes.fromhex(salt)).split(":", 1)[1], h)


def pin_is_set() -> bool:
    return bool(db.get_setting("admin_pin_hash"))


def set_pin(pin: str) -> None:
    if not (pin.isdigit() and 4 <= len(pin) <= 8):
        raise HTTPException(400, "The PIN must be 4 to 8 digits.")
    db.set_setting("admin_pin_hash", _hash(pin))


def new_teacher_code() -> str:
    code = f"{secrets.randbelow(9000) + 1000}"
    db.set_setting("teacher_code_hash", _hash(code))
    return code


def set_teacher_code(code: str) -> None:
    if not (code.isdigit() and 4 <= len(code) <= 8):
        raise HTTPException(400, "The teacher code must be 4 to 8 digits.")
    db.set_setting("teacher_code_hash", _hash(code))


def _locked(key: str) -> int:
    f = _fails.get(key)
    if f and len(f) >= MAX_TRIES and time.time() - f[-1] < LOCK_SECONDS:
        return int(LOCK_SECONDS - (time.time() - f[-1]))
    return 0


def login(role: str, secret: str, client: str) -> str:
    key = f"{role}:{client}"
    wait = _locked(key)
    if wait:
        raise HTTPException(429, f"Too many wrong tries. Please wait about {max(1, wait // 60)} minutes.")
    stored = db.get_setting("admin_pin_hash" if role == "admin" else "teacher_code_hash")
    ok = _check(secret, stored) or (role == "teacher" and _check(secret, db.get_setting("admin_pin_hash")))
    if not ok:
        _fails.setdefault(key, []).append(time.time())
        _fails[key] = _fails[key][-MAX_TRIES:]
        left = MAX_TRIES - len(_fails[key])
        raise HTTPException(401, "That code is not right." + (f" {left} tries left." if left > 0 else ""))
    _fails.pop(key, None)
    tok = secrets.token_urlsafe(24)
    _tokens[tok] = (role, time.time() + TOKEN_TTL)
    return tok


def role_of(token: str | None) -> str | None:
    if not token:
        return None
    v = _tokens.get(token)
    if not v or v[1] < time.time():
        _tokens.pop(token, None)
        return None
    return v[0]


def is_local(request: Request) -> bool:
    host = request.client.host if request.client else ""
    return host in ("127.0.0.1", "::1", "localhost")


def require_admin(request: Request, x_auth: str | None = Header(default=None)) -> None:
    # Before setup is finished (no PIN yet) the admin console is open only on this computer.
    if not pin_is_set():
        if is_local(request):
            return
        raise HTTPException(403, "Finish setup on the school computer first.")
    if role_of(x_auth) != "admin":
        raise HTTPException(401, "Enter the admin PIN.")


def require_teacher(request: Request, x_auth: str | None = Header(default=None)) -> None:
    if not pin_is_set() and is_local(request):
        return
    if role_of(x_auth) not in ("teacher", "admin"):
        raise HTTPException(401, "Enter the teacher code.")
