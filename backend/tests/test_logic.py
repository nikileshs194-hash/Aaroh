"""Automatic checks (D10): selection rules, capacity calculation, controller decisions,
network address classification, safety filter. Run:  scripts\\run-tests.bat"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["INFERSMART_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

from app import selection, stats, safety, tester, models_lib  # noqa: E402
from app.controller import CState, Obs, decide  # noqa: E402
from app.privacy import is_inside  # noqa: E402


def R(name, tps, ttft, mem, q=70.0, passed=True, file=None):
    return {"key": name, "label": name, "model_file": file or name, "tps": tps, "ttft": ttft, "peak_mem_gb": mem,
            "quality_score": q, "quality_pass": passed, "config": {}}


# ---------------- selection
def test_filter_rejects_quality_memory_and_slow():
    res = [R("ok", 12, 0.5, 2), R("badq", 20, 0.4, 1.5, passed=False), R("big", 8, 1, 12), R("slow", 3, 1, 2)]
    kept, rej = selection.filter_settings(res, budget_gb=10, min_tps=5)
    assert [r["key"] for r in kept] == ["ok"]
    whys = {r["key"]: r["rejected_why"] for r in rej}
    assert "quality" in whys["badq"] and "memory" in whys["big"] and "slower" in whys["slow"]


def test_goal_changes_recommendation():
    res = [R("fast", 30, 0.3, 1.0, q=55, file="a"), R("smart", 9, 0.8, 3.0, q=80, file="b")]
    assert selection.select(res, 12, "fast", 5, ["en"])["recommended"]["key"] == "fast"
    assert selection.select(res, 12, "best", 5, ["en"])["recommended"]["key"] == "smart"


def test_tie_prefers_smaller_memory():
    res = [R("a", 20, 0.5, 3.0, q=70), R("b", 19.9, 0.5, 2.0, q=70)]
    rec, runner = selection.pick(selection.score(res, 12, "balanced"))
    assert rec["key"] == "b" and runner["key"] == "a"


def test_fast_model_must_fit_alongside():
    rec = R("q", 10, 0.6, 3.0, file="big")
    kept = [rec, R("f", 25, 0.3, 1.0, file="small"), R("huge", 40, 0.2, 9.0, file="other")]
    assert selection.pick_fast(kept, rec, budget_gb=8)["key"] == "f"
    assert selection.pick_fast([rec, R("x", 11, 0.5, 1.0, file="s2")], rec, 8) is None  # not meaningfully faster


def test_no_candidates_gives_plain_message():
    out = selection.select([R("slow", 1, 5, 1)], 8, "balanced", 5, ["en"])
    assert out["recommended"] is None and "comfort limits" in out["reason"]


def test_reason_mentions_numbers():
    r = R("a", 14.2, 0.5, 2.0)
    r["quality_delta"] = 1.7
    s = selection.reason(r, "balanced", ["en", "kn"], 13.0)
    assert "English and Kannada" in s and "14" in s and "11.0 GB" in s


# ---------------- capacity / stats
def test_capacity_stops_at_first_failure():
    steps = [{"students": 1, "tps_med": 12, "ttft_p95": 0.8}, {"students": 2, "tps_med": 9, "ttft_p95": 1.5},
             {"students": 4, "tps_med": 6, "ttft_p95": 2.9}, {"students": 6, "tps_med": 4.5, "ttft_p95": 4.0},
             {"students": 8, "tps_med": 6, "ttft_p95": 2.0}]
    assert stats.capacity_n(steps, 5, 3) == 4


def test_capacity_zero_when_one_student_fails():
    assert stats.capacity_n([{"students": 1, "tps_med": 3, "ttft_p95": 1}], 5, 3) == 0


def test_percentile_and_noise():
    assert stats.percentile([1, 2, 3, 4, 5], 50) == 3
    assert abs(stats.percentile([1, 2, 3, 4, 5], 95) - 4.8) < 1e-9
    assert stats.spread([10, 10.5, 9.8]) < 0.10
    assert stats.spread([10, 13, 9]) > 0.10


# ---------------- controller (hysteresis)
def O(t, users=1, ttft=1.0, tps=10.0, queued=0, active=1, mem=4.0):
    return Obs(t=t, active=active, queued=queued, users=users, ttft_p95=ttft, tps_med=tps, free_mem_gb=mem)


def test_controller_waits_20s_before_switching():
    st = CState()
    assert decide(st, O(0, 9, ttft=6), 3, 5, 6) == ("quality", None)
    assert decide(st, O(10, 9, ttft=6), 3, 5, 6) == ("quality", None)
    mode, why = decide(st, O(20, 9, ttft=6), 3, 5, 6)
    assert mode == "fast" and "9 users" in why and "6 s (limit 3 s)" in why


def test_controller_flicker_resets_timer():
    st = CState()
    decide(st, O(0, 9, ttft=6), 3, 5, 6)
    decide(st, O(15, 2, ttft=1), 3, 5, 6)      # recovered briefly
    assert decide(st, O(30, 9, ttft=6), 3, 5, 6)[0] == "quality"  # only 0 s broken since reset


def test_controller_goes_to_protect_then_back():
    st = CState(mode="fast")
    decide(st, O(0, 14, ttft=8), 3, 5, 6)
    assert decide(st, O(21, 14, ttft=8), 3, 5, 6)[0] == "protect"
    decide(st, O(30, 1, ttft=0.5, active=0), 3, 5, 6)
    assert decide(st, O(80, 1, ttft=0.5, active=0), 3, 5, 6)[0] == "protect"  # 50 s calm: not yet
    mode, why = decide(st, O(91, 1, ttft=0.5, active=0), 3, 5, 6)
    assert mode == "fast" and "quiet for 60 s" in why


def test_controller_not_calm_while_over_capacity():
    st = CState(mode="fast")
    decide(st, O(0, 10, ttft=1.0), 3, 5, 6)
    assert decide(st, O(70, 10, ttft=1.0), 3, 5, 6)[0] == "fast"


def test_controller_lock():
    st = CState()
    mode, why = decide(st, O(0), 3, 5, 6, lock="protect")
    assert mode == "protect" and "locked" in why


def test_slow_writing_counts_as_broken():
    st = CState()
    decide(st, O(0, 5, ttft=1, tps=2), 3, 5, 6)
    assert decide(st, O(20, 5, ttft=1, tps=2), 3, 5, 6)[0] == "fast"


# ---------------- privacy address classification
def test_inside_addresses():
    for ip in ["127.0.0.1", "::1", "192.168.1.20", "10.0.0.5", "172.16.3.4", "169.254.1.1", "224.0.0.251",
               "100.64.1.2", "fe80::1", "0.0.0.0"]:
        assert is_inside(ip), ip


def test_outside_addresses():
    for ip in ["1.1.1.1", "8.8.8.8", "142.250.183.14", "2606:4700:4700::1111", "172.32.0.1"]:
        assert not is_inside(ip), ip


# ---------------- safety
def test_blocks_unsafe_but_allows_school_topics():
    assert safety.check("how to make a bomb at home") == "weapons"
    assert safety.check("I want to kill myself") == "self_harm"
    assert safety.check("hack my friend's instagram password") == "hacking"
    for ok in ["What is a nuclear explosion in a star?", "Explain drug resistance in bacteria",
               "How do guns of the Mughal army compare? (history)", "Why do volcanoes explode?"]:
        assert safety.check(ok) is None, ok


def test_refusal_languages():
    assert "14416" in safety.refusal("self_harm", "en")
    assert safety.refusal("weapons", "kn") != safety.refusal("weapons", "en")


def test_pii_warning():
    assert safety.pii_warning("my number is 9876543210") == "a phone number"
    assert safety.pii_warning("what is 2+2") is None


# ---------------- quality guard
def test_quality_guard_flags_rough_setting():
    models = [{"file": "M-2B-Q4_K_M.gguf", "family": "M", "params_b": 2.0, "quant": "Q4_K_M"},
              {"file": "M-2B-Q8_0.gguf", "family": "M", "params_b": 2.0, "quant": "Q8_0"}]
    orig = models_lib.find
    models_lib.find = lambda f: next(m for m in models if m["file"] == f)
    try:
        results = [{"model_file": "M-2B-Q4_K_M.gguf"}, {"model_file": "M-2B-Q8_0.gguf"}]
        q = {"M-2B-Q4_K_M.gguf": {"by_lang": {"en": {"acc": 60.0, "n": 30}, "kn": {"acc": 30.0, "n": 30}}},
             "M-2B-Q8_0.gguf": {"by_lang": {"en": {"acc": 70.0, "n": 30}, "kn": {"acc": 31.0, "n": 30}}}}
        tester.apply_quality(results, q, models, ["en", "kn"], 3.0, 35.0)
        assert results[0]["quality_pass"] is False and "en dropped 10" in results[0]["quality_fail_why"]
        assert results[1]["quality_pass"] is True
        assert results[1]["weak_langs"] == ["kn"]  # no model reaches the floor in kn: shown as weak, not rejected
        # once another model reaches the floor, a model below it is rejected
        models.append({"file": "M-4B-Q4_K_M.gguf", "family": "M", "params_b": 4.0, "quant": "Q4_K_M"})
        results = [{"model_file": "M-2B-Q8_0.gguf"}, {"model_file": "M-4B-Q4_K_M.gguf"}]
        q["M-4B-Q4_K_M.gguf"] = {"by_lang": {"en": {"acc": 80.0, "n": 30}, "kn": {"acc": 50.0, "n": 30}}}
        tester.apply_quality(results, q, models, ["en", "kn"], 3.0, 35.0)
        assert results[0]["quality_pass"] is False and "floor" in results[0]["quality_fail_why"]
        assert results[1]["quality_pass"] is True
    finally:
        models_lib.find = orig


def test_parse_choice():
    assert tester._parse_choice("3") == 2
    assert tester._parse_choice("Answer: 1.") == 0
    assert tester._parse_choice("B") == 1
    assert tester._parse_choice("none") is None
    assert tester._parse_choice("೩") == 2       # Kannada digit three
    assert tester._parse_choice("उत्तर: २") == 1  # Devanagari digit two


def test_grid_fits_memory():
    models = [{"file": f"Q-{p}B-{q}.gguf", "path": "x", "params_b": p, "quant": q, "est_mem_gb": p * s}
              for p in (0.8, 2.0, 4.0) for q, s in (("Q4_K_M", 0.7), ("Q5_K_M", 0.8), ("Q8_0", 1.1))]
    hw = {"mem_budget_gb": 5.5, "cores": 4}
    grid = tester.build_grid(models, hw)
    assert 4 <= len(grid) <= 9
    assert all("4.0B-Q8" not in g.model_file for g in grid)
    assert {g.threads for g in grid} == {2, 4}


# ---------------- Kannada routing
def _kn(file, tps, mem, kn):
    return {"key": file, "label": file, "model_file": file, "tps": tps, "peak_mem_gb": mem,
            "quality": {"en": {"acc": 90}, "kn": {"acc": kn}},
            "config": {"model_file": file, "model_path": file, "threads": 12, "batch": 512}}


def test_kannada_model_picked_when_clearly_better_and_fits():
    main = _kn("Qwen3.5-2B-Q4_K_M.gguf", 13.8, 2.3, 65)
    big = _kn("Qwen3.5-4B-Q4_K_M.gguf", 6.4, 5.4, 82)
    run = {"data": {"languages": ["en", "kn"]}, "results": [main, big]}
    k, pick = tester.kannada_engine_config(run, main, None, None, {"mem_budget_gb": 12}, 3072, 8)
    assert k.model_file == "Qwen3.5-4B-Q4_K_M.gguf" and k.parallel == 2 and pick is big
    # does not fit in memory next to the main model -> Kannada stays on the main model
    k, _ = tester.kannada_engine_config(run, main, None, None, {"mem_budget_gb": 7.5}, 3072, 8)
    assert k is None
    # too slow for one student -> not used
    slow = _kn("Qwen3.5-4B-Q4_K_M.gguf", 3.0, 5.4, 82)
    k, _ = tester.kannada_engine_config({"data": {"languages": ["en", "kn"]}, "results": [main, slow]}, main, None, None,
                                        {"mem_budget_gb": 12}, 3072, 8)
    assert k is None
    # Kannada not chosen as a language -> no Kannada engine
    k, _ = tester.kannada_engine_config({"data": {"languages": ["en"]}, "results": [main, big]}, main, None, None,
                                        {"mem_budget_gb": 12}, 3072, 8)
    assert k is None
