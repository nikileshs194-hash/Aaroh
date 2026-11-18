"""Teacher library (F13) and batch queue (F14)."""
from __future__ import annotations

import asyncio
import json
import time

from . import db, templates
from .events import bus, log_event
from .router import router
from .safety import SYSTEM_PROMPT, language_instruction


def item_row(r: dict) -> dict:
    r = dict(r)
    r["fields"] = db.jload(r.get("fields"), {})
    r["reviewed"] = bool(r.get("reviewed"))
    r["shared"] = bool(r.get("shared"))
    return r


def list_items(author: str | None = None, shared_only: bool = False) -> list[dict]:
    if shared_only:
        rows = db.query("SELECT * FROM library_item WHERE shared=1 ORDER BY updated DESC")
    elif author:
        rows = db.query("SELECT * FROM library_item WHERE author=? ORDER BY updated DESC", (author,))
    else:
        rows = db.query("SELECT * FROM library_item ORDER BY updated DESC")
    return [item_row(r) for r in rows]


def get_item(iid: int) -> dict | None:
    r = db.one("SELECT * FROM library_item WHERE id=?", (iid,))
    return item_row(r) if r else None


def save_item(template: str, fields: dict, body: str, author: str, title: str | None = None) -> int:
    t = time.time()
    return db.execute(
        "INSERT INTO library_item(created,updated,template,fields,language,title,body,reviewed,shared,author) VALUES(?,?,?,?,?,?,?,0,0,?)",
        (t, t, template, json.dumps(fields), fields.get("language", "en"), title or templates.title_for(template, fields), body, author))


def update_item(iid: int, **kw) -> None:
    allowed = {"body", "title", "reviewed", "shared"}
    sets, vals = [], []
    for k, v in kw.items():
        if k in allowed and v is not None:
            sets.append(f"{k}=?")
            vals.append(int(v) if isinstance(v, bool) else v)
    if sets:
        db.execute(f"UPDATE library_item SET {', '.join(sets)}, updated=? WHERE id=?", (*vals, time.time(), iid))


def delete_item(iid: int) -> None:
    db.execute("DELETE FROM library_item WHERE id=?", (iid,))


def messages_for(template: str, fields: dict) -> tuple[list[dict], int]:
    prompt, max_tokens = templates.build_prompt(template, fields)
    sys = SYSTEM_PROMPT + " You are helping a teacher prepare classroom material. " + language_instruction(fields.get("language", "en"))
    return [{"role": "system", "content": sys}, {"role": "user", "content": prompt}], max_tokens


# ---------------------------------------------------------------- batch queue
def enqueue(label: str, request: dict) -> int:
    jid = db.execute("INSERT INTO batch_job(created,status,label,request) VALUES(?,?,?,?)",
                     (time.time(), "queued", label, json.dumps(request)))
    bus.publish("batch", {"id": jid, "status": "queued"})
    return jid


def list_jobs(author: str | None = None) -> list[dict]:
    rows = db.query("SELECT * FROM batch_job ORDER BY id DESC LIMIT 200")
    out = []
    for r in rows:
        r["request"] = db.jload(r["request"], {})
        if author and r["request"].get("author") != author:
            continue
        out.append(r)
    return out


class BatchWorker:
    def __init__(self) -> None:
        self.paused = False
        self.current: dict | None = None

    def can_run(self) -> bool:
        if self.paused:
            return False
        if db.get_setting("batch_pause_when_busy"):
            # wait until no student has asked anything for 30 s and nobody is queued
            if router.active_by_kind["student"] > 0 or router.waiting or time.time() - router.last_student_activity < 30:
                return False
        return True

    async def loop(self) -> None:
        while True:
            await asyncio.sleep(3)
            try:
                if not self.can_run():
                    continue
                job = db.one("SELECT * FROM batch_job WHERE status='queued' ORDER BY id LIMIT 1")
                if not job:
                    continue
                req = db.jload(job["request"], {})
                db.execute("UPDATE batch_job SET status='running' WHERE id=?", (job["id"],))
                self.current = {"id": job["id"], "label": job["label"], "chars": 0}
                bus.publish("batch", {"id": job["id"], "status": "running"})
                msgs, max_tokens = messages_for(req["template"], req["fields"])
                text, err = "", None
                async for ev in router.chat(msgs, "batch", "batch", max_tokens):
                    if ev["type"] == "token":
                        text += ev["text"]
                        self.current["chars"] = len(text)
                    elif ev["type"] == "error":
                        err = ev["message"]
                if err or not text.strip():
                    db.execute("UPDATE batch_job SET status='queued', error=? WHERE id=?", (err or "empty", job["id"]))
                    await asyncio.sleep(20)
                else:
                    iid = save_item(req["template"], req["fields"], text.strip(), req.get("author", "Teacher"))
                    db.execute("UPDATE batch_job SET status='done', item_id=? WHERE id=?", (iid, job["id"]))
                    bus.publish("batch", {"id": job["id"], "status": "done", "item_id": iid})
                    left = db.one("SELECT COUNT(*) AS n FROM batch_job WHERE status IN ('queued','running')")["n"]
                    if left == 0:
                        log_event("info", "Batch queue finished: all prepared items are in My plans.")
                self.current = None
            except Exception as ex:
                self.current = None
                log_event("error", f"Batch queue problem: {ex}")
                await asyncio.sleep(10)


batch = BatchWorker()
