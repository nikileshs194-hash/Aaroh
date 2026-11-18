"""Test runner (M5, M6, M7): fair benchmark, quality guard, selection and capacity planner.

One run = speed tests on ~8 settings -> quality check per model file -> selection -> capacity
simulation of 1..12 virtual students. Progress streams live; results are saved as they arrive so
a stopped run can resume.
"""
from __future__ import annotations

import asyncio
import json
import random
import re
import time
from dataclasses import asdict

import httpx
import psutil

from . import db, hardware, models_lib, selection, stats
from .config import TESTSET_PATH
from .engines import EngineConfig, complete, engines, save_active, stream_chat
from .events import bus, log_event
from .safety import SYSTEM_PROMPT

SUMMARY_TEXT = (
    "The water cycle describes how water moves on, above and below the surface of the Earth. "
    "The sun heats water in rivers, lakes and oceans and turns it into vapour, a process called evaporation. "
    "Plants also release water vapour through their leaves, which is called transpiration. "
    "As the warm, moist air rises it cools, and the vapour condenses into tiny droplets that form clouds. "
    "When the droplets join and become heavy, they fall back as rain, hail or snow; this is precipitation. "
    "Some of the water flows over the land as run-off into streams and rivers, and some soaks into the "
    "ground to become groundwater, which feeds wells and borewells. In India the monsoon brings most of the "
    "year's rain between June and September, filling tanks and reservoirs that farmers depend on. "
    "Cutting forests, paving land and over-using borewells all disturb the cycle, causing floods in some "
    "places and water shortage in others. Rainwater harvesting, protecting lakes and planting trees help "
    "keep the cycle healthy."
)

BENCH_PROMPTS = {
    "en": [
        ("short", "What is the boiling point of water at sea level?"),
        ("explain", "Explain in one paragraph why we have day and night."),
        ("lesson", "Write a short 40-minute lesson plan outline for Class 8 on the water cycle."),
        ("summary", "Summarise this passage in three sentences:\n\n" + SUMMARY_TEXT),
    ],
    "kn": [
        ("short", "ಸಮುದ್ರ ಮಟ್ಟದಲ್ಲಿ ನೀರಿನ ಕುದಿಯುವ ಬಿಂದು ಎಷ್ಟು?"),
        ("explain", "ಹಗಲು ಮತ್ತು ರಾತ್ರಿ ಏಕೆ ಆಗುತ್ತದೆ ಎಂದು ಒಂದು ಪ್ಯಾರಾದಲ್ಲಿ ವಿವರಿಸಿ."),
        ("lesson", "8ನೇ ತರಗತಿಗೆ ಜಲಚಕ್ರದ ಬಗ್ಗೆ 40 ನಿಮಿಷಗಳ ಪಾಠ ಯೋಜನೆಯ ಸಂಕ್ಷಿಪ್ತ ರೂಪ ಬರೆಯಿರಿ."),
        ("summary", "ಈ ಭಾಗವನ್ನು ಮೂರು ವಾಕ್ಯಗಳಲ್ಲಿ ಕನ್ನಡದಲ್ಲಿ ಸಾರಾಂಶಗೊಳಿಸಿ:\n\n" + SUMMARY_TEXT),
    ],
    "hi": [
        ("short", "समुद्र तल पर पानी का क्वथनांक कितना होता है?"),
        ("explain", "एक अनुच्छेद में समझाइए कि दिन और रात क्यों होते हैं।"),
        ("lesson", "कक्षा 8 के लिए जल चक्र पर 40 मिनट की पाठ योजना की संक्षिप्त रूपरेखा लिखिए।"),
        ("summary", "इस अनुच्छेद का हिंदी में तीन वाक्यों में सारांश लिखिए:\n\n" + SUMMARY_TEXT),
    ],
}

CLASSROOM_QUESTIONS = [
    ("en", "What is photosynthesis? Explain simply."),
    ("en", "Why is the sky blue?"),
    ("en", "Give two examples of renewable energy used in India."),
    ("en", "What is the difference between mass and weight?"),
    ("en", "Explain Ohm's law with an example."),
    ("kn", "ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ ಎಂದರೇನು? ಸರಳವಾಗಿ ವಿವರಿಸಿ."),
    ("kn", "ಮಳೆ ಹೇಗೆ ಬರುತ್ತದೆ?"),
    ("hi", "प्रकाश संश्लेषण क्या है? सरल शब्दों में समझाइए।"),
    ("hi", "भारत में कौन-कौन सी ऋतुएँ होती हैं?"),
]

QUICK = {"reps": 1, "prompts_per_lang": 2, "max_tokens": 96, "cooldown": 2, "cap_step_s": 30, "quality_n": 20}
FULL = {"reps": 3, "prompts_per_lang": 4, "max_tokens": 160, "cooldown": 8, "cap_step_s": 120, "quality_n": None}
CAP_STEPS = [1, 2, 4, 6, 8, 10, 12]


def _cfg_dict(c: EngineConfig) -> dict:
    return asdict(c)


def build_grid(models: list[dict], hw: dict) -> list[EngineConfig]:
    """About eight settings chosen from this PC's cores and memory (D5.1). Skips what won't fit."""
    budget = hw["mem_budget_gb"]
    cores = max(1, hw["cores"])
    half = max(1, cores // 2)
    fit = [m for m in models if m["est_mem_gb"] + 1.0 <= budget]

    def get(params: float, quant: str):
        return next((m for m in fit if abs(m["params_b"] - params) < 0.01 and m["quant"] == quant), None)

    sizes = sorted({m["params_b"] for m in fit})
    if not sizes:
        return []
    # "small" = the middle size that fits (2B on most PCs), "quality" = next size up, "tiny" = smallest
    small = 2.0 if 2.0 in sizes else sizes[len(sizes) // 2]
    bigger = [s for s in sizes if s > small]
    quality = bigger[0] if bigger else None
    tiny = sizes[0] if sizes[0] < small else None

    grid: list[EngineConfig] = []

    def add(m, threads, ctx=2048, batch=512, label=""):
        if m:
            grid.append(EngineConfig(m["file"], m["path"], threads, ctx, batch, 1, label))

    s4 = get(small, "Q4_K_M")
    add(s4, half, label="half the cores")
    add(s4, cores, label="all cores")
    add(s4, cores, batch=1024, label="all cores, bigger batch")
    add(s4, cores, ctx=1024, label="all cores, smaller context")
    add(get(small, "Q5_K_M"), cores, label="all cores")
    add(get(small, "Q8_0"), cores, label="all cores (reference)")
    if quality:
        add(get(quality, "Q4_K_M"), cores, label="all cores")
        add(get(quality, "Q5_K_M"), cores, label="all cores")
    if tiny:
        add(get(tiny, "Q4_K_M"), cores, label="all cores (fast candidate)")
    if not grid:  # unusual model set: test whatever fits
        for m in fit[:8]:
            add(m, cores, label="all cores")
    return grid


def classify_lang(q: dict) -> str:
    return q["lang"]


def _mcq_prompt(item: dict) -> list[dict]:
    opts = "\n".join(f"{i+1}. {o}" for i, o in enumerate(item["options"]))
    passage = f"Passage:\n{item['passage']}\n\n" if item.get("passage") else ""
    return [
        {"role": "system", "content": "You answer multiple-choice questions. Reply with only the number of the correct option."},
        {"role": "user", "content": f"{passage}Question: {item['question']}\n\nOptions:\n{opts}\n\nAnswer with 1, 2, 3 or 4 only."},
    ]


_INDIC_DIGITS = str.maketrans("೧೨೩೪१२३४১২৩৪௧௨௩௪", "1234123412341234")


def _parse_choice(text: str) -> int | None:
    """First option number in the reply. Models sometimes answer with Kannada or Devanagari digits."""
    text = (text or "").translate(_INDIC_DIGITS)
    m = re.search(r"[1-4]", text)
    if m:
        return int(m.group(0)) - 1
    m = re.search(r"\b([A-D])\b", (text or "").upper())
    return "ABCD".index(m.group(1)) if m else None


class TestRunner:
    def __init__(self) -> None:
        self.task: asyncio.Task | None = None
        self.stop_flag = asyncio.Event()
        self.state: dict = {"status": "idle"}
        self.measuring = False   # while True, nothing else may start the serving engines (fair measurements)

    # ------------------------------------------------------------------ public
    def progress(self) -> dict:
        return self.state

    def running(self) -> bool:
        return self.task is not None and not self.task.done()

    def start(self, goal: str, class_size: str, languages: list[str], quick: bool, resume_run: int | None = None,
              only: list[str] | None = None) -> int:
        if self.running():
            raise RuntimeError("A test is already running.")
        hw = hardware.scan_and_save()
        if resume_run:
            run_id = resume_run
            db.execute("UPDATE test_run SET status='running' WHERE id=?", (run_id,))
        else:
            run_id = db.execute("INSERT INTO test_run(ts,goal,status,data) VALUES(?,?,?,?)",
                                (time.time(), goal, "running",
                                 json.dumps({"class_size": class_size, "languages": languages, "quick": quick, "hardware": hw})))
        self.stop_flag = asyncio.Event()
        self.task = asyncio.create_task(self._run(run_id, goal, languages, quick, hw, only))
        return run_id

    def recheck_capacity(self, run_id: int) -> None:
        """Measure classroom capacity again for a finished run (e.g. after something else used the PC)."""
        if self.running():
            raise RuntimeError("A test is already running.")
        self.stop_flag = asyncio.Event()
        self.task = asyncio.create_task(self._recheck(run_id))

    async def _recheck(self, run_id: int) -> None:
        row = db.one("SELECT * FROM test_run WHERE id=?", (run_id,))
        data = db.jload(row["data"], {})
        rec = (data.get("selection") or {}).get("recommended")
        mode = QUICK if data.get("quick") else FULL
        min_tps, max_ttft = float(db.get_setting("min_tps")), float(db.get_setting("max_ttft"))
        self.state = {"status": "running", "run_id": run_id, "phase": "capacity", "index": 1, "total": 1,
                      "units_done": 0, "units_total": 1, "settings": [], "started": time.time(), "cap_steps": [],
                      "eta_s": mode["cap_step_s"] * len(CAP_STEPS)}
        was_serving = [n for n in ("A", "B") if engines[n].status in ("ready", "starting") or engines[n].wanted]
        self.measuring = True
        for n in ("A", "B"):
            await engines[n].stop()
        log_event("test", "Checking classroom capacity again (student chat paused for about 15 minutes).")
        try:
            cap = await self.capacity(EngineConfig(**rec["config"]), mode, min_tps, max_ttft,
                                      on_step=lambda s: self._pub(cap_steps=self.state.get("cap_steps", []) + [s]))
            if self.stop_flag.is_set():
                raise asyncio.CancelledError
            db.execute("INSERT INTO capacity_result(run_id,ts,data) VALUES(?,?,?)", (run_id, time.time(), json.dumps(cap)))
            data["capacity"] = cap
            data["capacity_rechecked"] = time.time()
            db.execute("UPDATE test_run SET data=? WHERE id=?", (json.dumps(data), run_id))
            log_event("test", f"Capacity checked again: about {cap['n']} students comfortably (simulated, tested up to {cap['tested_up_to']}).")
            self._pub(status="done", phase="done", units_done=1, eta_s=0)
        except asyncio.CancelledError:
            await engines["T"].stop()
            self._pub(status="stopped")
        except Exception as ex:
            await engines["T"].stop()
            log_event("error", f"The capacity check stopped because of a problem: {ex}")
            self._pub(status="error", error=str(ex))
        self.measuring = False
        await _resume_serving(was_serving)

    async def stop(self) -> None:
        self.stop_flag.set()
        if self.task:
            try:
                await asyncio.wait_for(asyncio.shield(self.task), timeout=30)
            except Exception:
                pass

    # ------------------------------------------------------------------ helpers
    def _pub(self, **kw) -> None:
        self.state.update(kw)
        self.state["updated"] = time.time()
        bus.publish("test", self.state)

    async def _sample(self, pid_getter, out: dict, stop: asyncio.Event) -> None:
        psutil.cpu_percent(interval=None)
        peak, cpu = 0.0, []
        while not stop.is_set():
            pid = pid_getter()
            if pid:
                try:
                    peak = max(peak, psutil.Process(pid).memory_info().rss / 1073741824)
                except Exception:
                    pass
            cpu.append(psutil.cpu_percent(interval=None))
            await asyncio.sleep(0.25)
        out["peak_mem_gb"] = round(peak, 2)
        out["cpu_avg"] = round(sum(cpu[1:]) / max(1, len(cpu) - 1), 1) if len(cpu) > 1 else None

    # ------------------------------------------------------------------ speed
    async def bench_setting(self, cfg: EngineConfig, langs: list[str], mode: dict, on_text=None) -> dict:
        eng = engines["T"]
        eng.affinity = hardware.cpu_affinity_for(cfg.threads)
        load = await eng.start(cfg)
        sampler_out: dict = {}
        stop_s = asyncio.Event()
        sampler = asyncio.create_task(self._sample(lambda: eng.proc.pid if eng.alive() else None, sampler_out, stop_s))
        second = next((l for l in langs if l != "en"), "kn")
        prompts = [(f"{k}_en", p) for k, p in BENCH_PROMPTS["en"][: mode["prompts_per_lang"]]] + \
                  [(f"{k}_{second}", p) for k, p in BENCH_PROMPTS.get(second, [])[: mode["prompts_per_lang"]]]
        rep_tps, rep_ttft, per_prompt = [], [], {}
        async with httpx.AsyncClient(timeout=httpx.Timeout(600, connect=5)) as client:
            # warm-up, not measured
            async for _ in stream_chat(eng, [{"role": "user", "content": "Say hello in one word."}], 8, 0.0, client):
                pass
            for rep in range(mode["reps"]):
                tps_l, ttft_l = [], []
                for kind, p in prompts:
                    if self.stop_flag.is_set():
                        break
                    text = ""
                    msgs = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": p}]
                    last_pub = 0.0
                    async for ev in stream_chat(eng, msgs, mode["max_tokens"], 0.0, client):
                        if ev["type"] == "token":
                            text += ev["text"]
                            if on_text and time.time() - last_pub > 0.3:
                                on_text(text[-160:])
                                last_pub = time.time()
                        else:
                            tps_l.append(ev["tps"])
                            ttft_l.append(ev["ttft"])
                            per_prompt.setdefault(kind, []).append(ev["tps"])
                rep_tps.append(stats.median(tps_l))
                rep_ttft.append(stats.median(ttft_l))
        stop_s.set()
        await sampler
        await eng.stop()
        sp = stats.spread([x for x in rep_tps if x])
        return {
            "key": cfg.key(), "config": _cfg_dict(cfg), "model_file": cfg.model_file,
            "load_s": load, "tps": round(stats.median(rep_tps) or 0, 2), "ttft": round(stats.median(rep_ttft) or 0, 3),
            "rep_tps": rep_tps, "noise": round(sp, 3), "noisy": sp > 0.10 and len(rep_tps) > 1,
            "peak_mem_gb": sampler_out.get("peak_mem_gb", 0.0), "cpu_avg": sampler_out.get("cpu_avg"),
            "per_prompt": {k: stats.median(v) for k, v in per_prompt.items()},
        }

    # ------------------------------------------------------------------ quality
    async def quality_for(self, m: dict, n: int, langs: list[str], on_progress=None) -> dict:
        cached = db.one("SELECT data FROM quality_result WHERE model_file=? AND n=?", (m["file"], n))
        if cached:
            return db.jload(cached["data"])
        sets = json.loads(TESTSET_PATH.read_text(encoding="utf-8"))["sets"]
        hw = hardware.scan()
        cfg = EngineConfig(m["file"], m["path"], hw["cores"], 2048, 512, 4, "quality check")
        eng = engines["T"]
        eng.affinity = hardware.cpu_affinity_for(cfg.threads)
        await eng.start(cfg)
        sem = asyncio.Semaphore(4)
        results: dict = {}
        done = 0
        total = sum(min(n, len(s["items"])) for k, s in sets.items() if s["lang"] in set(langs) | {"en"})
        async with httpx.AsyncClient(timeout=httpx.Timeout(600, connect=5)) as client:
            async def ask(item):
                nonlocal done
                async with sem:
                    if self.stop_flag.is_set():
                        return None
                    try:
                        out = await complete(eng, _mcq_prompt(item), 4, 0.0, client)
                    except Exception:
                        out = ""
                    done += 1
                    if on_progress:
                        on_progress(done, total)
                    return _parse_choice(out) == item["answer"]

            for key, s in sets.items():
                if s["lang"] not in set(langs) | {"en"}:
                    continue
                items = s["items"][:n]
                oks = await asyncio.gather(*(ask(it) for it in items))
                if self.stop_flag.is_set():
                    break
                results[key] = {"lang": s["lang"], "n": len(items), "correct": sum(1 for o in oks if o),
                                "acc": round(100 * sum(1 for o in oks if o) / max(1, len(items)), 1), "source": s["source"]}
        await eng.stop()
        if self.stop_flag.is_set():
            return {}
        q = {"model_file": m["file"], "sets": results, "by_lang": _by_lang(results), "n": n}
        db.execute("INSERT OR REPLACE INTO quality_result(model_file,n,ts,data) VALUES(?,?,?,?)",
                   (m["file"], n, time.time(), json.dumps(q)))
        return q

    # ------------------------------------------------------------------ capacity
    async def capacity(self, cfg: EngineConfig, mode: dict, min_tps: float, max_ttft: float, on_step=None) -> dict:
        # Enough parallel slots that the slot count itself never caps the answer; serving slots are then
        # sized from the measured capacity (apply_selection).
        slots = max(CAP_STEPS)
        cap_cfg = EngineConfig(cfg.model_file, cfg.model_path, cfg.threads, 2048, cfg.batch, slots, "capacity")
        eng = engines["T"]
        eng.affinity = hardware.cpu_affinity_for(cfg.threads)
        await eng.start(cap_cfg)
        steps = []
        fails = 0
        async with httpx.AsyncClient(timeout=httpx.Timeout(600, connect=5), limits=httpx.Limits(max_connections=64)) as client:
            for students in CAP_STEPS:
                if self.stop_flag.is_set():
                    break
                rec = await _simulate(eng, client, students, mode["cap_step_s"], self.stop_flag)
                step = {"students": students, **rec}
                step["ok"] = (step["tps_med"] or 0) >= min_tps and (step["ttft_p95"] or 1e9) <= max_ttft
                steps.append(step)
                if on_step:
                    on_step(step)
                fails = 0 if step["ok"] else fails + 1
                if fails >= 2:
                    break
        await eng.stop()
        n = stats.capacity_n(steps, min_tps, max_ttft)
        return {"steps": steps, "n": n, "tested_up_to": steps[-1]["students"] if steps else 0, "slots": slots,
                "min_tps": min_tps, "max_ttft": max_ttft, "step_seconds": mode["cap_step_s"]}

    # ------------------------------------------------------------------ main flow
    async def _run(self, run_id: int, goal: str, langs: list[str], quick: bool, hw: dict, only: list[str] | None) -> None:
        mode = QUICK if quick else FULL
        min_tps = float(db.get_setting("min_tps"))
        max_ttft = float(db.get_setting("max_ttft"))
        qn = mode["quality_n"] or int(db.get_setting("quality_n"))
        margin = float(db.get_setting("quality_margin"))
        floor = float(db.get_setting("quality_floor"))
        models = models_lib.list_models(hw["mem_budget_gb"])
        grid = build_grid(models, hw)
        if only:
            grid = [g for g in grid if g.key() in only] or grid
        done_rows = {r["key"]: db.jload(r["data"]) for r in db.query("SELECT key,data FROM test_result WHERE run_id=?", (run_id,))}
        files_for_quality = _quality_files(grid, models, hw)
        total_units = len(grid) + len(files_for_quality) + 1
        self.state = {"status": "running", "run_id": run_id, "phase": "speed", "index": 0, "total": len(grid),
                      "units_done": 0, "units_total": total_units, "settings": [], "preview": "",
                      "started": time.time(), "eta_s": None, "quick": quick, "goal": goal, "languages": langs}
        log_event("test", f"Test started: {len(grid)} settings on this computer ({'quick' if quick else 'full'} test).")
        # Fair test: the serving engines would compete for the processor and memory, so pause them.
        was_serving = [n for n in ("A", "B") if engines[n].status in ("ready", "starting") or engines[n].wanted]
        self.measuring = True
        for n in ("A", "B"):
            await engines[n].stop()
        if was_serving:
            log_event("info", "Student chat is paused while the test runs, so the measurements are fair.")
        if hw.get("on_battery"):
            log_event("info", "The laptop is on battery. Plug it in for fair, faster results.")
        try:
            # ---------------- speed
            results = []
            t_unit = []
            for i, cfg in enumerate(grid):
                label = f"{models_lib.find(cfg.model_file)['name']} · {models_lib.QUANT_LABEL.get(models_lib.parse(cfg.model_file)['quant'])}"
                self._pub(phase="speed", index=i + 1, current=label, current_detail=cfg.label)
                if self.stop_flag.is_set():
                    break
                if cfg.key() in done_rows:
                    results.append(done_rows[cfg.key()])
                    continue
                t0 = time.time()
                try:
                    r = await self.bench_setting(cfg, langs, mode, on_text=lambda t: self._pub(preview=t))
                except Exception as ex:
                    await engines["T"].stop()
                    r = {"key": cfg.key(), "config": _cfg_dict(cfg), "model_file": cfg.model_file, "error": str(ex),
                         "tps": 0, "ttft": 0, "peak_mem_gb": 0}
                r["label"] = label
                r["detail"] = cfg.label
                if self.stop_flag.is_set():
                    break
                db.execute("INSERT INTO test_result(run_id,key,data) VALUES(?,?,?)", (run_id, cfg.key(), json.dumps(r)))
                results.append(r)
                t_unit.append(time.time() - t0)
                remaining = (len(grid) - i - 1) + len(files_for_quality) * 1.2 + 2.5
                self._pub(settings=[_brief(x) for x in results], units_done=i + 1,
                          eta_s=round(stats.median(t_unit) * remaining) if t_unit else None)
                await asyncio.sleep(mode["cooldown"])
            if self.stop_flag.is_set():
                raise asyncio.CancelledError

            # ---------------- quality (re-list files: a reference may have finished downloading meanwhile)
            files_for_quality = _quality_files(grid, models_lib.list_models(hw["mem_budget_gb"]), hw)
            self._pub(units_total=len(grid) + len(files_for_quality) + 1)
            quality: dict[str, dict] = {}
            for j, m in enumerate(files_for_quality):
                self._pub(phase="quality", current=f"{m['name']} · {m['quality_label']}", current_detail="checking answers",
                          q_done=0, q_total=0)
                q = await self.quality_for(m, qn, langs, on_progress=lambda d, t: self._pub(q_done=d, q_total=t))
                if self.stop_flag.is_set():
                    raise asyncio.CancelledError
                quality[m["file"]] = q
                self._pub(units_done=len(grid) + j + 1)
            apply_quality(results, quality, models, langs, margin, floor)
            for r in results:
                db.execute("UPDATE test_result SET data=? WHERE run_id=? AND key=?", (json.dumps(r), run_id, r["key"]))

            # ---------------- selection
            sel = selection.select(results, hw["mem_budget_gb"], goal, min_tps, langs)
            rec = sel["recommended"]
            self._pub(phase="capacity", settings=[_brief(x) for x in results], selection=_sel_brief(sel))
            cap = None
            if rec:
                cfg = EngineConfig(**rec["config"])
                cap = await self.capacity(cfg, mode, min_tps, max_ttft,
                                          on_step=lambda s: self._pub(cap_steps=self.state.get("cap_steps", []) + [s]))
                if self.stop_flag.is_set():
                    raise asyncio.CancelledError
                db.execute("INSERT INTO capacity_result(run_id,ts,data) VALUES(?,?,?)", (run_id, time.time(), json.dumps(cap)))
            summary = {"selection": _sel_brief(sel), "capacity": cap, "quality": quality, "hardware": hw,
                       "languages": langs, "goal": goal, "quick": quick, "finished": time.time(),
                       "duration_s": round(time.time() - self.state["started"])}
            row = db.one("SELECT data FROM test_run WHERE id=?", (run_id,))
            data = db.jload(row["data"], {}) if row else {}
            data.update(summary)
            db.execute("UPDATE test_run SET status='done', data=? WHERE id=?", (json.dumps(data), run_id))
            if rec:
                n = cap["n"] if cap else 0
                log_event("test", f"Test finished. This computer can serve about {n} students comfortably with "
                                  f"{rec['label']} (simulated, tested up to {cap['tested_up_to'] if cap else 0}).")
            else:
                log_event("test", "Test finished, but no setting met the comfort limits on this computer.")
            self._pub(status="done", phase="done", run_id=run_id, eta_s=0)
            self.measuring = False
            await _resume_serving(was_serving)
        except asyncio.CancelledError:
            await engines["T"].stop()
            db.execute("UPDATE test_run SET status='stopped' WHERE id=?", (run_id,))
            log_event("test", "Test paused. Press Continue to resume where it stopped.")
            self._pub(status="stopped")
            self.measuring = False
            await _resume_serving(was_serving)
        except Exception as ex:  # never leave a raw error on screen
            await engines["T"].stop()
            db.execute("UPDATE test_run SET status='error' WHERE id=?", (run_id,))
            log_event("error", f"The test stopped because of a problem: {ex}")
            self._pub(status="error", error=str(ex))
            self.measuring = False
            await _resume_serving(was_serving)


async def _resume_serving(was_serving: list[str]) -> None:
    """Restart the last good setting after a test (the admin can apply the new one from the result)."""
    if not was_serving:
        return
    from .engines import load_active
    a, b, _ = load_active()
    if a:
        try:
            await start_engines(a, b)
            log_event("info", "Student chat is back on with the saved setting.")
        except Exception as ex:
            log_event("error", f"Could not restart the AI engine after the test: {ex}")


def _quality_files(grid: list, models: list[dict], hw: dict) -> list[dict]:
    """Every model file in the grid plus its 8-bit reference, if that fits in memory."""
    out: list[dict] = []
    for g in grid:
        m = next((x for x in models if x["file"] == g.model_file), None)
        if m and m["file"] not in [x["file"] for x in out]:
            out.append(m)
        ref = models_lib.reference_for(m, models) if m else None
        if ref and ref["est_mem_gb"] + 1.0 <= hw["mem_budget_gb"] and ref["file"] not in [x["file"] for x in out]:
            out.append(ref)
    return out


def _by_lang(sets: dict) -> dict:
    out: dict[str, dict] = {}
    for k, v in sets.items():
        d = out.setdefault(v["lang"], {"correct": 0, "n": 0})
        d["correct"] += v["correct"]
        d["n"] += v["n"]
    for d in out.values():
        d["acc"] = round(100 * d["correct"] / max(1, d["n"]), 1)
    return out


def apply_quality(results: list[dict], quality: dict, models: list[dict], langs: list[str], margin: float, floor: float) -> None:
    """Mark each setting pass/fail per language (D5.2).

    A setting passes when, in every chosen language, it is within `margin` points of its own 8-bit
    reference AND at or above the `floor`. If no tested model reaches the floor in a language, that
    language is marked weak for all settings instead (shown honestly, teacher review label stays on),
    so the school still gets a recommendation."""
    floor_reachable = {}
    for lang in langs:
        floor_reachable[lang] = any((q.get("by_lang", {}).get(lang, {}).get("acc") or 0) >= floor for q in quality.values())
    for r in results:
        if r.get("error"):
            continue
        q = quality.get(r["model_file"])
        if not q:
            r["quality_pass"] = None
            continue
        m = models_lib.find(r["model_file"])
        ref = models_lib.reference_for(m, models) if m else None
        refq = quality.get(ref["file"]) if ref else None
        per, worst_delta, fails, weak = {}, 0.0, [], []
        for lang in langs:
            a = q["by_lang"].get(lang, {}).get("acc")
            if a is None:
                continue
            ra = refq["by_lang"].get(lang, {}).get("acc") if refq else None
            delta = (ra - a) if ra is not None else None
            per[lang] = {"acc": a, "ref": ra, "delta": delta, "n": q["by_lang"][lang]["n"]}
            if delta is not None:
                worst_delta = max(worst_delta, delta)
                if delta > margin:
                    fails.append(f"{lang} dropped {delta:.0f} points")
            if a < floor:
                if floor_reachable.get(lang):
                    fails.append(f"{lang} below the {floor:g}% floor")
                else:
                    weak.append(lang)
            elif not floor_reachable.get(lang):
                weak.append(lang)
        r["quality"] = per
        r["quality_score"] = round(sum(v["acc"] for v in per.values()) / max(1, len(per)), 1) if per else None
        r["quality_delta"] = round(worst_delta, 1) if refq else None
        r["quality_pass"] = not fails
        r["quality_fail_why"] = "; ".join(fails) or None
        r["weak_langs"] = weak
    for r in results:  # languages that are weak relative to English get the honest warning too
        if r.get("quality") and "en" in r["quality"]:
            for lang, v in r["quality"].items():
                if lang != "en" and v["acc"] < r["quality"]["en"]["acc"] - 25 and lang not in r.get("weak_langs", []):
                    r.setdefault("weak_langs", []).append(lang)


def _brief(r: dict) -> dict:
    keys = ("key", "label", "detail", "model_file", "tps", "ttft", "peak_mem_gb", "cpu_avg", "noisy", "noise", "load_s",
            "error", "quality", "quality_score", "quality_pass", "quality_delta", "quality_fail_why", "weak_langs",
            "config", "rep_tps", "score", "score_parts", "rejected_why")
    return {k: r.get(k) for k in keys if k in r}


def _sel_brief(sel: dict) -> dict:
    return {
        "recommended": _brief(sel["recommended"]) if sel["recommended"] else None,
        "runner_up": _brief(sel["runner_up"]) if sel["runner_up"] else None,
        "fast": _brief(sel["fast"]) if sel["fast"] else None,
        "reason": sel["reason"], "goal": sel["goal"], "fast_note": sel.get("fast_note"),
        "scored": [_brief(x) for x in sel["scored"]], "rejected": [_brief(x) for x in sel["rejected"]],
    }


async def _simulate(eng, client: httpx.AsyncClient, students: int, seconds: float, stop: asyncio.Event) -> dict:
    """Virtual students: ask, read the answer, pause 10-30 s, ask again (D5.4)."""
    ttfts, tpss, errors = [], [], 0
    end = time.perf_counter() + seconds

    async def student(i: int):
        nonlocal errors
        await asyncio.sleep(random.uniform(0, min(5, seconds / 4)))
        while time.perf_counter() < end and not stop.is_set():
            lang, q = random.choice(CLASSROOM_QUESTIONS)
            msgs = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": q}]
            try:
                async for ev in stream_chat(eng, msgs, 200, 0.7, client):
                    if ev["type"] == "done":
                        ttfts.append(ev["ttft"])
                        tpss.append(ev["tps"])
            except Exception:
                errors += 1
            await asyncio.sleep(random.uniform(10, 30))

    await asyncio.gather(*(student(i) for i in range(students)))
    return {"requests": len(ttfts), "errors": errors,
            "tps_med": round(stats.median(tpss) or 0, 2), "tps_p10": round(stats.percentile(tpss, 10) or 0, 2),
            "ttft_med": round(stats.median(ttfts) or 0, 2), "ttft_p95": round(stats.percentile(ttfts, 95) or 0, 2)}


runner = TestRunner()


def latest_run(done_only: bool = True) -> dict | None:
    row = db.one("SELECT * FROM test_run WHERE status='done' ORDER BY id DESC LIMIT 1") if done_only else \
        db.one("SELECT * FROM test_run ORDER BY id DESC LIMIT 1")
    if not row:
        return None
    row["data"] = db.jload(row["data"], {})
    row["results"] = [db.jload(r["data"]) for r in db.query("SELECT data FROM test_result WHERE run_id=? ORDER BY id", (row["id"],))]
    return row


async def apply_selection(run: dict, use: str = "recommended") -> dict:
    """Start engine A with the chosen setting and, if memory allows, engine B with the fast model (F8)."""
    sel = run["data"]["selection"]
    chosen = sel.get(use) or sel.get("recommended")
    if not chosen:
        raise RuntimeError("There is no recommended setting yet. Run the test first.")
    cap = run["data"].get("capacity") or {}
    # Serving slots follow the measured capacity: a couple more than N so a short burst still starts quickly.
    slots = min(max(CAP_STEPS), max(4, int(cap.get("n") or 0) + 2))
    db.set_setting("slots", slots)
    ctx = int(db.get_setting("ctx_per_slot") or 2048)
    c = chosen["config"]
    a = EngineConfig(c["model_file"], c["model_path"], c["threads"], ctx, c["batch"], slots, "quality model")
    b = None
    fast = sel.get("fast")
    hw = hardware.scan()
    if fast and fast["model_file"] != a.model_file:
        f = fast["config"]
        free_after = hw["mem_budget_gb"] - (chosen["peak_mem_gb"] + fast["peak_mem_gb"])
        if free_after >= 1.0:
            # Both engines share the processor; the fast one gets all cores too (they rarely both run hard).
            b = EngineConfig(f["model_file"], f["model_path"], f["threads"], ctx, f["batch"], slots, "fast model")
    await start_engines(a, b)
    save_active(a, b, {"run_id": run["id"], "capacity_n": cap.get("n"), "label": chosen.get("label"),
                       "fast_label": fast.get("label") if b and fast else None})
    return {"A": asdict(a), "B": asdict(b) if b else None}


async def start_engines(a: EngineConfig, b: EngineConfig | None) -> None:
    if runner.measuring:
        raise RuntimeError("A test is measuring this computer right now; student chat comes back when it finishes.")
    for name, cfg in (("A", a), ("B", b)):
        e = engines[name]
        if cfg is None:
            await e.stop()
            continue
        e.affinity = hardware.cpu_affinity_for(cfg.threads)
        await e.start(cfg)
    log_event("info", f"InferSmart started: quality model {a.model_file}" + (f", fast model {b.model_file}." if b else "."))
