"""Aaroh control centre (M2): every service in D6, the live-update channel and the web interface."""
from __future__ import annotations

import asyncio
import csv
import io
import json
import os
import time
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path

import psutil
from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import auth, db, hardware, models_lib, privacy, safety, speech, templates, tester
from .config import APP_PORT, APP_VERSION, ENGINE_EXE, ENGINE_RELEASE, FRONTEND_DIST, ROOT
from .engines import EngineConfig, engines, load_active, save_active
from .events import bus, log_event, recent_events
from .router import classsim, router

ADMIN = [Depends(auth.require_admin)]


# ------------------------------------------------------------------ lifecycle
async def preload_speech() -> None:
    await asyncio.sleep(20)  # let the AI engines start first
    try:
        done = await asyncio.to_thread(speech.preload)
        if done:
            log_event("info", "Voice input ready: " + ", ".join("English" if l == "en" else "Kannada" for l in done) + ".")
    except Exception as ex:
        log_event("error", f"Voice input could not be prepared: {ex}")


async def autostart() -> None:
    """After a reboot or power cut, start with the last good setting (F21)."""
    if not (db.get_setting("setup_done") and db.get_setting("autostart")):
        return
    a, b, _ = load_active()
    if not a:
        return
    try:
        await tester.start_engines(a, b)
        log_event("restart", "Aaroh started by itself with the last good setting.")
    except Exception as ex:
        log_event("error", f"Could not start the AI engine automatically: {ex}. Open Settings and press Re-test.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.conn()
    bus.loop = asyncio.get_running_loop()
    engines.start_watchdog()
    tasks = [asyncio.create_task(router.control_loop()), asyncio.create_task(router.metrics_loop()),
             asyncio.create_task(privacy.watcher.loop()),
             asyncio.create_task(autostart()), asyncio.create_task(preload_speech())]
    log_event("info", f"Control centre started (version {APP_VERSION}).")
    yield
    for t in tasks:
        t.cancel()
    await engines.stop_all()


app = FastAPI(title="Aaroh control centre", version=APP_VERSION, lifespan=lifespan,
              description="Services used by the Aaroh interface. Available only on the school network.")


def sse(gen):
    async def wrap():
        try:
            async for ev in gen:
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except asyncio.CancelledError:
            raise
    return StreamingResponse(wrap(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ------------------------------------------------------------------ public
@app.get("/api/health", tags=["public"])
def health():
    return {"ok": True, "version": APP_VERSION, "engine_installed": ENGINE_EXE.exists(),
            "engines": {n: e.status for n, e in engines.engines.items()}, "mode": router.mode(),
            "setup_done": bool(db.get_setting("setup_done"))}


@app.get("/api/public", tags=["public"])
def public_info(request: Request):
    return {
        "setup_done": bool(db.get_setting("setup_done")), "school_name": db.get_setting("school_name"),
        "exam_mode": bool(db.get_setting("exam_mode")), "wifi_name": db.get_setting("wifi_name"),
        "mode": router.mode(), "engine_ready": engines["A"].status == "ready" or engines["B"].status == "ready",
        "pin_set": auth.pin_is_set(), "is_server": auth.is_local(request),
        "theme": db.get_setting("theme"), "ui_language": db.get_setting("ui_language"),
        "languages": db.get_setting("languages"), "setup_step": db.get_setting("setup_step"),
    }


@app.post("/api/login", tags=["public"])
def login(request: Request, body: dict = Body(...)):
    role = body.get("role")
    if role != "admin":
        raise HTTPException(400, "Unknown role")
    tok = auth.login(role, str(body.get("secret", "")), request.client.host if request.client else "?")
    return {"token": tok, "role": role}


@app.get("/api/live", tags=["public"])
async def live(token: str | None = Query(default=None)):
    role = auth.role_of(token)
    admin = role == "admin" or not auth.pin_is_set()
    q = bus.subscribe()

    async def gen():
        try:
            yield {"topic": "hello", "data": {"mode": router.mode()}}
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield {"topic": "ping", "data": {}}
                    continue
                m = json.loads(msg)
                if admin or m["topic"] in ("mode", "engine"):
                    yield m
        finally:
            bus.unsubscribe(q)
    return sse(gen())


# ------------------------------------------------------------------ student chat
def _trim_history(messages: list[dict]) -> list[dict]:
    msgs = [{"role": m.get("role", "user"), "content": str(m.get("content", ""))[:2000]}
            for m in messages if m.get("role") in ("user", "assistant")][-6:]
    total = 0
    out = []
    for m in reversed(msgs):
        total += len(m["content"])
        if total > 3500 and out:
            break
        out.append(m)
    return list(reversed(out))


@app.post("/api/chat", tags=["chat"])
async def chat(request: Request, body: dict = Body(...), x_auth: str | None = Header(default=None)):
    lang = body.get("language", "en")
    device = str(body.get("device_id") or (request.client.host if request.client else "anon"))[:64]
    role = auth.role_of(x_auth)
    kind = "teacher" if role in ("teacher", "admin") else "student"
    msgs = _trim_history(body.get("messages", []))
    if not msgs or msgs[-1]["role"] != "user":
        raise HTTPException(400, "No question")
    question = msgs[-1]["content"]
    if body.get("followup") in ("simpler", "example"):
        msgs.append({"role": "user", "content": templates.followup_prompt(body["followup"], lang)})

    async def gen():
        if kind == "student" and db.get_setting("exam_mode"):
            yield {"type": "blocked", "category": "exam", "text": safety.EXAM_MODE.get(lang, safety.EXAM_MODE["en"])}
            return
        cat = safety.check(question)
        if cat:
            yield {"type": "blocked", "category": cat, "text": safety.refusal(cat, lang)}
            return
        pii = safety.pii_warning(question)
        if pii:
            yield {"type": "notice", "text": f"Your question seems to contain {pii}. You never need to type personal details here."}
        system = {"role": "system", "content": safety.SYSTEM_PROMPT + " " + safety.language_instruction(lang)}
        cancel = asyncio.Event()
        try:
            async for ev in router.chat([system] + msgs, device, kind, int(body.get("max_tokens", 600)), cancel, lang=lang):
                if await request.is_disconnected():
                    cancel.set()
                yield ev
        finally:
            cancel.set()
    return sse(gen())


@app.get("/api/stt", tags=["chat"])
def stt_status():
    """Which voice-input languages are installed on this computer."""
    return {"available": speech.available(), "models": speech.MODEL_INFO, "max_seconds": speech.MAX_SECONDS}


@app.post("/api/stt", tags=["chat"])
async def stt(request: Request, lang: str = Query("en")):
    """Voice to text, offline. Body: 16 kHz mono 16-bit WAV. The audio is processed in memory and never stored."""
    data = await request.body()
    if len(data) > 2_500_000:
        raise HTTPException(413, f"Please speak for less than {speech.MAX_SECONDS} seconds.")
    try:
        return await asyncio.to_thread(speech.transcribe, lang, data)
    except FileNotFoundError as ex:
        raise HTTPException(503, str(ex))
    except ValueError as ex:
        raise HTTPException(400, str(ex))


@app.post("/api/report", tags=["chat"])
def report_answer(body: dict = Body(...)):
    """'Report this answer': only the category and time are stored, never the text."""
    db.execute("INSERT INTO report(ts,category,language) VALUES(?,?,?)",
               (time.time(), str(body.get("category", "other"))[:30], str(body.get("language", "en"))[:5]))
    log_event("info", "A student reported an answer as unsuitable. Review the safety settings if this repeats.")
    return {"ok": True}


# OpenAI-style service so other tools can connect (D6 "Chat")
@app.get("/v1/models", tags=["chat"])
def v1_models():
    data = [{"id": e.config.model_file, "object": "model", "owned_by": "local"} for e in engines.engines.values()
            if e.status == "ready" and e.config and e.name in ("A", "B", "K")]
    return {"object": "list", "data": data}


@app.post("/v1/chat/completions", tags=["chat"])
async def v1_chat(request: Request, body: dict = Body(...)):
    msgs = [m for m in body.get("messages", []) if m.get("role") in ("system", "user", "assistant")]
    user_text = next((m.get("content", "") for m in reversed(msgs) if m.get("role") == "user"), "")
    if isinstance(user_text, str) and safety.check(user_text):
        cat = safety.check(user_text)
        text = safety.refusal(cat, "en")
    else:
        text = None
    msgs = [{"role": "system", "content": safety.SYSTEM_PROMPT}] + [m for m in msgs if m["role"] != "system"]
    device = request.client.host if request.client else "api"
    created = int(time.time())
    if not body.get("stream"):
        if text is None:
            text = ""
            async for ev in router.chat(msgs, device, "api", int(body.get("max_tokens") or 512)):
                if ev["type"] == "token":
                    text += ev["text"]
                elif ev["type"] == "error":
                    raise HTTPException(503, ev["message"])
        return {"id": f"chatcmpl-{created}", "object": "chat.completion", "created": created, "model": "infersmart",
                "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}]}

    async def gen():
        def chunk(content=None, finish=None):
            delta = {"content": content} if content is not None else {}
            return "data: " + json.dumps({"id": f"chatcmpl-{created}", "object": "chat.completion.chunk", "created": created,
                                          "model": "infersmart", "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]},
                                         ensure_ascii=False) + "\n\n"
        if text is not None:
            yield chunk(text)
        else:
            async for ev in router.chat(msgs, device, "api", int(body.get("max_tokens") or 512)):
                if ev["type"] == "token":
                    yield chunk(ev["text"])
        yield chunk(finish="stop")
        yield "data: [DONE]\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")


# ------------------------------------------------------------------ setup / hardware / models
@app.get("/api/hardware", tags=["admin"], dependencies=ADMIN)
def get_hardware():
    return hardware.scan_and_save()


@app.post("/api/hardware/simulator", tags=["admin"], dependencies=ADMIN)
def set_simulator(body: dict = Body(...)):
    sim = {"enabled": bool(body.get("enabled")), "cores": int(body.get("cores", 4)), "mem_gb": float(body.get("mem_gb", 8))}
    db.set_setting("simulator", sim)
    log_event("info", ("Classroom PC simulator on: " + f"{sim['cores']} cores, {sim['mem_gb']:g} GB memory.")
              if sim["enabled"] else "Classroom PC simulator off: using this computer's real hardware.")
    return hardware.scan()


@app.get("/api/models", tags=["admin"], dependencies=ADMIN)
def get_models():
    hw = hardware.scan()
    return {"models": models_lib.list_models(hw["mem_budget_gb"]), "budget_gb": hw["mem_budget_gb"]}


@app.post("/api/models/verify", tags=["admin"], dependencies=ADMIN)
async def verify_model(body: dict = Body(...)):
    return await asyncio.to_thread(models_lib.verify_checksum, body.get("file", ""))


@app.post("/api/setup/step", tags=["admin"], dependencies=ADMIN)
def setup_step(body: dict = Body(...)):
    for k in ("setup_step", "goal", "class_size", "languages", "school_name", "ui_language"):
        if k in body:
            db.set_setting(k, body[k])
    return {"ok": True}


@app.post("/api/setup/finish", tags=["admin"], dependencies=ADMIN)
async def setup_finish(body: dict = Body(...)):
    if body.get("pin"):
        auth.set_pin(str(body["pin"]))
    if not auth.pin_is_set():
        raise HTTPException(400, "Choose an admin PIN first.")
    if body.get("school_name"):
        db.set_setting("school_name", body["school_name"])
    run = tester.latest_run()
    if run and not (engines["A"].status == "ready"):
        await tester.apply_selection(run, body.get("use", "recommended"))
    db.set_setting("setup_done", True)
    db.set_setting("setup_step", "done")
    log_event("setup", "Setup finished. Aaroh is ready for the class.")
    token = auth.login("admin", str(body["pin"]), "setup") if body.get("pin") else None
    return {"token": token, "share": share_info()}


# ------------------------------------------------------------------ tests and results
@app.post("/api/test/start", tags=["admin"], dependencies=ADMIN)
async def test_start(body: dict = Body(default={})):
    goal = body.get("goal") or db.get_setting("goal")
    langs = body.get("languages") or db.get_setting("languages")
    db.set_setting("goal", goal)
    db.set_setting("languages", langs)
    if body.get("class_size"):
        db.set_setting("class_size", body["class_size"])
    try:
        rid = tester.runner.start(goal, body.get("class_size") or db.get_setting("class_size"), langs, bool(body.get("quick", False)))
    except RuntimeError as ex:
        raise HTTPException(409, str(ex))
    return {"run_id": rid}


@app.post("/api/test/stop", tags=["admin"], dependencies=ADMIN)
async def test_stop():
    await tester.runner.stop()
    return {"ok": True}


@app.post("/api/test/resume", tags=["admin"], dependencies=ADMIN)
async def test_resume():
    row = db.one("SELECT * FROM test_run WHERE status IN ('stopped','error','running') ORDER BY id DESC LIMIT 1")
    if not row:
        raise HTTPException(404, "Nothing to resume.")
    data = db.jload(row["data"], {})
    rid = tester.runner.start(row["goal"], data.get("class_size", "class"), data.get("languages", ["en"]),
                              bool(data.get("quick")), resume_run=row["id"])
    return {"run_id": rid}


@app.post("/api/test/capacity", tags=["admin"], dependencies=ADMIN)
async def test_capacity():
    """Re-measure classroom capacity for the latest finished test (about 15 minutes)."""
    run = tester.latest_run()
    if not run:
        raise HTTPException(404, "Run the test first.")
    try:
        tester.runner.recheck_capacity(run["id"])
    except RuntimeError as ex:
        raise HTTPException(409, str(ex))
    return {"run_id": run["id"]}


@app.get("/api/test/progress", tags=["admin"], dependencies=ADMIN)
def test_progress():
    p = dict(tester.runner.progress())
    if p.get("status") in (None, "idle"):
        row = db.one("SELECT id,status FROM test_run ORDER BY id DESC LIMIT 1")
        if row and row["status"] in ("stopped", "error", "running") and not tester.runner.running():
            p = {"status": "stopped", "run_id": row["id"], "resumable": True}
    return p


@app.get("/api/results", tags=["admin"], dependencies=ADMIN)
def results(run_id: int | None = None):
    if run_id:
        row = db.one("SELECT * FROM test_run WHERE id=?", (run_id,))
        if not row:
            raise HTTPException(404, "No such test")
        row["data"] = db.jload(row["data"], {})
        row["results"] = [db.jload(r["data"]) for r in db.query("SELECT data FROM test_result WHERE run_id=? ORDER BY id", (run_id,))]
        return row
    run = tester.latest_run()
    if not run:
        return {"empty": True}
    return run


@app.post("/api/results/reselect", tags=["admin"], dependencies=ADMIN)
def reselect(body: dict = Body(...)):
    """Change the goal and recompute the recommendation from the saved measurements (no re-test)."""
    from . import selection
    run = tester.latest_run()
    if not run:
        raise HTTPException(404, "Run the test first.")
    goal = body.get("goal") or run["data"].get("goal") or "balanced"
    hw = run["data"].get("hardware") or hardware.scan()
    langs = body.get("languages") or run["data"].get("languages", ["en"])
    if body.get("languages"):
        # Re-judge quality for the chosen languages from the saved scores (no re-test).
        for r in run["results"]:
            r["quality"] = {k: v for k, v in (r.get("quality") or {}).items() if k in langs}
        tester.apply_quality(run["results"], run["data"].get("quality") or {}, models_lib.list_models(hw["mem_budget_gb"]),
                             langs, float(db.get_setting("quality_margin")), float(db.get_setting("quality_floor")))
        for r in run["results"]:
            db.execute("UPDATE test_result SET data=? WHERE run_id=? AND key=?", (json.dumps(r), run["id"], r["key"]))
        run["data"]["languages"] = langs
        db.set_setting("languages", langs)
    sel = selection.select(run["results"], hw["mem_budget_gb"], goal, float(db.get_setting("min_tps")), langs)
    run["data"]["selection"] = tester._sel_brief(sel)
    run["data"]["goal"] = goal
    db.execute("UPDATE test_run SET data=?, goal=? WHERE id=?", (json.dumps(run["data"]), goal, run["id"]))
    db.set_setting("goal", goal)
    return run["data"]["selection"]


@app.get("/api/results/history", tags=["admin"], dependencies=ADMIN)
def results_history():
    rows = db.query("SELECT id,ts,goal,status,data FROM test_run ORDER BY id DESC LIMIT 30")
    out = []
    for r in rows:
        d = db.jload(r["data"], {})
        cap = d.get("capacity") or {}
        rec = (d.get("selection") or {}).get("recommended") or {}
        out.append({"id": r["id"], "ts": r["ts"], "goal": r["goal"], "status": r["status"], "quick": d.get("quick"),
                    "n": cap.get("n"), "recommended": rec.get("label"), "duration_s": d.get("duration_s"),
                    "simulated": (d.get("hardware") or {}).get("simulated")})
    return out


@app.get("/api/results/export.csv", tags=["admin"])
def export_csv(token: str | None = Query(default=None), request: Request = None):
    if auth.pin_is_set() and auth.role_of(token) != "admin":
        raise HTTPException(401, "Enter the admin PIN.")
    run = tester.latest_run()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["setting", "detail", "model_file", "threads", "batch", "context", "writing_speed_tps", "first_word_s",
                "peak_memory_gb", "cpu_avg_pct", "noisy", "quality_score", "quality_pass", "en_acc", "hi_acc", "kn_acc", "score"])
    for r in (run or {}).get("results", []):
        c = r.get("config", {})
        q = r.get("quality") or {}
        w.writerow([r.get("label"), r.get("detail"), r.get("model_file"), c.get("threads"), c.get("batch"), c.get("ctx"),
                    r.get("tps"), r.get("ttft"), r.get("peak_mem_gb"), r.get("cpu_avg"), r.get("noisy"),
                    r.get("quality_score"), r.get("quality_pass"),
                    (q.get("en") or {}).get("acc"), (q.get("hi") or {}).get("acc"), (q.get("kn") or {}).get("acc"),
                    next((s.get("score") for s in ((run.get("data") or {}).get("selection") or {}).get("scored", [])
                          if s.get("key") == r.get("key")), "")])
    cap = ((run or {}).get("data") or {}).get("capacity") or {}
    if cap:
        w.writerow([])
        w.writerow(["capacity: students", "requests", "median writing speed", "p95 first word (s)", "ok"])
        for s in cap.get("steps", []):
            w.writerow([s["students"], s["requests"], s["tps_med"], s["ttft_p95"], s["ok"]])
        w.writerow(["serves about", cap.get("n")])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=infersmart_results.csv"})


# ------------------------------------------------------------------ engines
@app.post("/api/apply", tags=["admin"], dependencies=ADMIN)
async def apply(body: dict = Body(default={})):
    run = tester.latest_run()
    if not run:
        raise HTTPException(404, "Run the test first.")
    try:
        return await tester.apply_selection(run, body.get("use", "recommended"))
    except Exception as ex:
        raise HTTPException(500, f"Could not start: {ex}")


@app.get("/api/engines", tags=["admin"], dependencies=ADMIN)
def engines_info():
    a, b, meta = load_active()
    return {"engines": engines.info(), "active": meta}


@app.post("/api/engines/custom", tags=["admin"], dependencies=ADMIN)
async def engine_custom(body: dict = Body(...)):
    """Start engine A with any setting (M4 test: e.g. change threads 2 -> 4)."""
    m = models_lib.find(body.get("model_file", ""))
    if not m:
        raise HTTPException(404, "Model file not found")
    cfg = EngineConfig(m["file"], m["path"], int(body.get("threads", 4)), int(body.get("ctx", db.get_setting("ctx_per_slot"))),
                       int(body.get("batch", 512)), int(body.get("parallel", db.get_setting("slots"))), "custom")
    _, b, meta = load_active()
    e = engines["A"]
    e.affinity = hardware.cpu_affinity_for(cfg.threads)
    try:
        await e.start(cfg)
    except Exception as ex:
        raise HTTPException(500, str(ex))
    if body.get("save"):
        # Only when asked: a one-off experiment must not replace the tested setting that comes back after a restart.
        save_active(cfg, b, {k: v for k, v in meta.items() if k not in ("A", "B", "saved_at")})
    log_event("info", f"Engine restarted by the admin with {cfg.threads} threads on {cfg.model_file}"
                      f"{' (saved)' if body.get('save') else ' (temporary; Restart returns to the saved setting)'}.")
    return e.info()


@app.post("/api/engines/restart", tags=["admin"], dependencies=ADMIN)
async def engine_restart():
    a, b, _ = load_active()
    if not a:
        raise HTTPException(404, "No saved setting yet.")
    await tester.start_engines(a, b)
    return engines.info()


@app.post("/api/engines/stop", tags=["admin"], dependencies=ADMIN)
async def engine_stop():
    for n in ("A", "B", "K"):
        await engines[n].stop()
    log_event("info", "AI engines stopped by the admin.")
    return engines.info()


# ------------------------------------------------------------------ dashboard / events
@app.get("/api/metrics/history", tags=["admin"], dependencies=ADMIN)
def metrics_history():
    return list(router.history)


@app.get("/api/events", tags=["admin"], dependencies=ADMIN)
def events(type: str | None = None, limit: int = 100):
    return recent_events(limit, type)


@app.get("/api/perf", tags=["admin"], dependencies=ADMIN)
def perf(minutes: int = 60):
    since = time.time() - minutes * 60
    return db.query("SELECT ts,engine,mode,ttft,tps,tokens,kind FROM perf_log WHERE ts>? ORDER BY ts", (since,))


@app.post("/api/mode/lock", tags=["admin"], dependencies=ADMIN)
def lock_mode(body: dict = Body(...)):
    m = body.get("mode")
    db.set_setting("lock_mode", m if m in ("quality", "fast", "protect") else None)
    if m not in ("quality", "fast", "protect"):
        log_event("switch", "Automatic switching turned back on by the admin.")
    return {"lock_mode": db.get_setting("lock_mode")}


@app.post("/api/simulate", tags=["admin"], dependencies=ADMIN)
async def simulate(body: dict = Body(...)):
    if body.get("stop"):
        return classsim.stop()
    return classsim.start(max(1, min(30, int(body.get("students", 10)))), max(20, min(900, int(body.get("seconds", 180)))))


@app.get("/api/simulate", tags=["admin"], dependencies=ADMIN)
def simulate_state():
    return classsim.state()


@app.get("/api/why-slow", tags=["admin"], dependencies=ADMIN)
def why_slow():
    """F26: explain current performance in one sentence from the system's own numbers."""
    o = router.observe()
    cap = (db.get_setting("active_config") or {}).get("capacity_n")
    cpu = psutil.cpu_percent(interval=0.2)
    lim_t, lim_s = float(db.get_setting("max_ttft")), float(db.get_setting("min_tps"))
    if o.ttft_p95 is None and o.active == 0:
        return {"text": "Nobody is asking right now, so there is nothing slowing it down."}
    parts = []
    if cap and o.users > cap:
        parts.append(f"{o.users} devices are active but this computer is comfortable with about {cap}")
    if o.queued:
        parts.append(f"{o.queued} questions are waiting in the queue")
    if cpu > 90:
        parts.append(f"the processor is at {cpu:.0f}%")
    if o.free_mem_gb < 1:
        parts.append(f"only {o.free_mem_gb:.1f} GB memory is free")
    if not parts:
        ok = (o.ttft_p95 or 0) <= lim_t and (o.tps_med or lim_s) >= lim_s
        return {"text": ("It is within the comfort limits: " if ok else "It is a little slow: ") +
                f"first word in about {o.ttft_p95 or 0:.1f} s and {o.tps_med or 0:.0f} tokens a second per answer, mode is {router.mode()}."}
    return {"text": "It is slower because " + ", and ".join(parts) + f". Mode is {router.mode()}."}


# ------------------------------------------------------------------ privacy
@app.get("/api/privacy", tags=["admin"], dependencies=ADMIN)
def privacy_status():
    last = db.one("SELECT * FROM offline_check ORDER BY id DESC LIMIT 1")
    return {**privacy.watcher.snapshot(), "last_offline_check": last, "store_chats": bool(db.get_setting("store_chats"))}


@app.post("/api/privacy/offline-check", tags=["admin"], dependencies=ADMIN)
async def offline_check():
    return await privacy.offline_check()


@app.post("/api/privacy/selftest", tags=["admin"], dependencies=ADMIN)
async def privacy_selftest():
    return await privacy.watcher.self_test()


@app.get("/api/privacy/report", tags=["admin"], dependencies=ADMIN)
def privacy_report():
    return privacy.report()


# ------------------------------------------------------------------ principal summary
@app.get("/api/summary", tags=["admin"], dependencies=ADMIN)
def summary():
    run = tester.latest_run()
    data = (run or {}).get("data", {})
    cap = data.get("capacity") or {}
    q = (data.get("selection") or {}).get("recommended") or {}
    week = time.time() - 7 * 86400
    answers = db.one("SELECT COUNT(*) AS n FROM perf_log WHERE ts>?", (week,))["n"]
    last_check = db.one("SELECT * FROM offline_check WHERE passed=1 ORDER BY id DESC LIMIT 1")
    langs = {}
    chosen_langs = db.get_setting("languages") or ["en", "kn"]
    active = db.get_setting("active_config") or {}
    for lang, v in (q.get("quality") or {}).items():
        if lang not in chosen_langs:
            continue
        if lang == "kn" and active.get("kannada_acc") is not None:
            v = {**v, "acc": active["kannada_acc"]}  # Kannada is answered by the Kannada model
        acc = v.get("acc") or 0
        langs[lang] = {"acc": acc, "n": v.get("n"), "label": "good" if acc >= 70 else "fair" if acc >= 50 else "weak",
                       "review": lang != "en"}
    return {
        "school_name": db.get_setting("school_name"), "capacity_n": cap.get("n"), "tested_up_to": cap.get("tested_up_to"),
        "simulated": (data.get("hardware") or {}).get("simulated"), "works_offline": bool(last_check),
        "last_offline_check": last_check, "outside_connections": privacy.watcher.outside_count,
        "watching_since": privacy.watcher.started, "chats_stored": False,
        "answers_this_week": answers, "languages": langs, "model": q.get("label"),
        "kannada_model": active.get("kannada_label"),
        "test_date": data.get("finished"), "hardware": data.get("hardware"),
    }


# ------------------------------------------------------------------ settings
@app.get("/api/settings", tags=["admin"], dependencies=ADMIN)
def get_settings():
    s = db.all_settings()
    for k in ("admin_pin_hash", "teacher_code_hash"):  # old databases may still hold a teacher code hash
        s.pop(k, None)
    s["autostart_on_login"] = startup_file().exists()
    return s


EDITABLE = {"min_tps", "max_ttft", "quality_margin", "quality_floor", "quality_n", "theme", "text_size", "ui_language",
            "autostart", "lock_mode", "exam_mode", "school_name", "blocked_topics", "slots", "ctx_per_slot",
            "wifi_name", "languages", "goal"}


@app.put("/api/settings", tags=["admin"], dependencies=ADMIN)
def put_settings(body: dict = Body(...)):
    changed = []
    for k, v in body.items():
        if k in EDITABLE:
            db.set_setting(k, v)
            changed.append(k)
    if "exam_mode" in body:
        log_event("info", "Exam mode on: student chat is switched off." if body["exam_mode"] else "Exam mode off: student chat is on.")
    return {"changed": changed}


@app.post("/api/settings/reset", tags=["admin"], dependencies=ADMIN)
def reset_settings(body: dict = Body(...)):
    for k in body.get("keys", []):
        if k in EDITABLE and k in db.DEFAULTS:
            db.set_setting(k, db.DEFAULTS[k])
    return {"ok": True}


@app.post("/api/settings/pin", tags=["admin"], dependencies=ADMIN)
def change_pin(body: dict = Body(...)):
    auth.set_pin(str(body.get("pin", "")))
    log_event("info", "Admin PIN changed.")
    return {"ok": True}


def startup_file() -> Path:
    return Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup" / "InferSmart.vbs"


@app.post("/api/settings/autostart-login", tags=["admin"], dependencies=ADMIN)
def autostart_login(body: dict = Body(...)):
    f = startup_file()
    if body.get("enabled"):
        script = ROOT / "scripts" / "start-hidden.vbs"
        f.write_text(f'CreateObject("WScript.Shell").Run """{script}""", 0, False\r\n')
        log_event("info", "Aaroh will start when this computer is switched on.")
    elif f.exists():
        f.unlink()
        log_event("info", "Aaroh will no longer start by itself when the computer is switched on.")
    return {"enabled": f.exists()}


@app.get("/api/backup", tags=["admin"])
def backup(token: str | None = Query(default=None)):
    """Settings and results in one file (D9 maintainability)."""
    if auth.pin_is_set() and auth.role_of(token) != "admin":
        raise HTTPException(401, "Enter the admin PIN.")
    out = {"settings": {k: v for k, v in db.all_settings().items()},
           "runs": db.query("SELECT * FROM test_run"), "results": db.query("SELECT * FROM test_result"),
           "capacity": db.query("SELECT * FROM capacity_result"), "quality": db.query("SELECT * FROM quality_result"),
           "events": db.query("SELECT * FROM event_log ORDER BY id DESC LIMIT 2000")}
    return JSONResponse(out, headers={"Content-Disposition": "attachment; filename=infersmart_backup.json"})


# ------------------------------------------------------------------ share
def lan_addresses() -> list[dict]:
    skip = ("vethernet", "wsl", "docker", "virtualbox", "vmware", "loopback", "bluetooth", "hyper-v", "vpn", "tailscale", "zerotier")
    stats_ = psutil.net_if_stats()
    out = []
    for name, addrs in psutil.net_if_addrs().items():
        if any(s in name.lower() for s in skip):
            continue
        st = stats_.get(name)
        if st and not st.isup:
            continue
        for a in addrs:
            if a.family.name == "AF_INET" and not a.address.startswith(("127.", "169.254.")) and privacy.is_inside(a.address):
                pri = 0 if "wi-fi" in name.lower() or "wlan" in name.lower() else 1 if "ethernet" in name.lower() else 2
                out.append({"interface": name, "ip": a.address, "priority": pri})
    out.sort(key=lambda x: x["priority"])
    return out


def share_info() -> dict:
    addrs = lan_addresses()
    ip = addrs[0]["ip"] if addrs else "127.0.0.1"
    return {"url": f"http://{ip}:{APP_PORT}", "ip": ip, "port": APP_PORT, "addresses": addrs,
            "wifi_name": db.get_setting("wifi_name"), "school_name": db.get_setting("school_name")}


@app.get("/api/share", tags=["public"])
def share():
    return share_info()


# ------------------------------------------------------------------ web interface
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith(("api/", "v1/", "docs", "openapi")):
            raise HTTPException(404)
        f = FRONTEND_DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(FRONTEND_DIST / "index.html", headers={"Cache-Control": "no-cache"})
else:
    @app.get("/", include_in_schema=False)
    def no_ui():
        return JSONResponse({"message": "Aaroh control centre is running. The interface has not been built yet; run scripts/setup.bat."})
