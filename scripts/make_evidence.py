"""Turn this computer's real measurements into docs/evidence/RESULTS.md and the filled slide deck.

Run with InferSmart running:
    .venv\\Scripts\\python scripts\\make_evidence.py --pin <admin PIN>
Uses the latest finished test run and, if present, docs/evidence/acceptance.json.
"""
import argparse
import html
import json
import os
import time

import httpx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = "http://127.0.0.1:8080"
LN = {"en": "English", "kn": "Kannada", "hi": "Hindi"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pin", default=os.environ.get("INFERSMART_PIN"))
    a = ap.parse_args()
    c = httpx.Client(timeout=60)
    h = {}
    if a.pin:
        h = {"X-Auth": c.post(B + "/api/login", json={"role": "admin", "secret": a.pin}).json()["token"]}
    run = c.get(B + "/api/results", headers=h).json()
    if run.get("empty"):
        raise SystemExit("No finished test yet.")
    d = run["data"]
    sel, cap, hw = d["selection"], d.get("capacity") or {}, d["hardware"]
    rows = run["results"]
    acc_path = os.path.join(ROOT, "docs", "evidence", "acceptance.json")
    acc = json.load(open(acc_path, encoding="utf-8")) if os.path.exists(acc_path) else {}
    rec = sel.get("recommended") or {}

    def find(label_part, detail_part=None):
        for r in rows:
            if label_part in (r.get("label") or "") and (detail_part is None or detail_part == r.get("detail")) and not r.get("error"):
                return r
        return None

    # ---- the insight sentence, built only from measured numbers
    insights = []
    half, full = find("2B · light", "half the cores"), find("2B · light", "all cores")
    if half and full:
        diff = (half["tps"] / full["tps"] - 1) * 100
        insights.append(f"Writing with {half['config']['threads']} threads gave {half['tps']:.1f} tokens/s versus {full['tps']:.1f} with "
                        f"{full['config']['threads']} ({diff:+.0f}%): on this laptop memory speed, not core count, limits writing, "
                        f"so InferSmart reads prompts with all threads but writes with fewer.")
    q2 = {r["model_file"]: r for r in rows if r.get("quality")}
    small = next((r for r in rows if "2B-Q4" in r["model_file"] and r.get("quality")), None)
    big = next((r for r in rows if "4B-Q4" in r["model_file"] and r.get("quality")), None)
    if small and big:
        langs = [l for l in ("kn", "hi") if l in small["quality"] and l in big["quality"]]
        if langs:
            parts = ", ".join(f"{LN[l]} {small['quality'][l]['acc']:.0f}% → {big['quality'][l]['acc']:.0f}%" for l in langs)
            insights.append(f"Going from the 2B to the 4B model changed Indian-language accuracy ({parts}) but cut writing speed from "
                            f"{small['tps']:.1f} to {big['tps']:.1f} tokens/s: the trade-off the goal setting decides.")
    insight = " ".join(insights) or "See the results table."

    # ---- quality table
    qrows = "<tr><th>Language</th><th>Recommended</th><th>Sample</th></tr>"
    for l, v in (rec.get("quality") or {}).items():
        qrows += f"<tr><td>{LN.get(l, l)}</td><td><b>{v['acc']:.0f}%</b>{' (8-bit ref ' + format(v['ref'], '.0f') + '%)' if v.get('ref') is not None else ''}</td><td>{v['n']} questions</td></tr>"

    sg = acc.get("speed_gain")
    if sg:
        b, af = list(sg.values())
        speed = f"Same model, engine defaults {b['median']:.1f} → InferSmart's setting {af['median']:.1f} tokens/s ({(af['median']/b['median']-1)*100:+.0f}%, median of 3)."
    else:
        speed = f"Recommended setting writes {rec.get('tps', 0):.1f} tokens/s with first word in {rec.get('ttft', 0):.1f} s for one user."
    rt = acc.get("red_team") or []
    refuse = [x for x in rt if x["expect"] != "answer"]
    answer = [x for x in rt if x["expect"] == "answer"]
    redteam = f"{sum(x['pass'] for x in refuse)}/{len(refuse)} unsafe prompts handled, {sum(x['pass'] for x in answer)}/{len(answer)} normal questions answered" if rt else "run scripts/acceptance.py"
    rc = acc.get("recovery") or {}
    privacy_after = acc.get("privacy_after") or c.get(B + "/api/privacy", headers=h).json()

    fill = {
        "DATE": time.strftime("%d %b %Y", time.localtime(d.get("finished", time.time()))),
        "N": str(cap.get("n", "–")), "UPTO": str(cap.get("tested_up_to", "–")),
        "REC": html.escape(rec.get("label", "–")),
        "REC_NUMS": f"{rec.get('tps', 0):.1f} tokens/s · first word {rec.get('ttft', 0):.1f} s · {rec.get('peak_mem_gb', 0):.1f} GB",
        "PRIV": str(privacy_after.get("outside_count", 0)),
        "SELFTEST": ("yes" if (acc.get("privacy_selftest") or {}).get("caught") else "run the self-test") ,
        "RECOV": f"{rc['seconds_to_ready']:.0f} s" if rc.get("pass") else "–",
        "QN": str(max([v.get("n", 0) for v in (rec.get("quality") or {}).values()] or [0])),
        "QUALITY_ROWS": qrows, "SPEEDGAIN": html.escape(speed), "REDTEAM": html.escape(redteam),
        "HW": html.escape(f"{hw['cpu']}, {hw['cores']} cores / {hw['threads']} threads, {hw['mem_total_gb']} GB, {hw['os']}" + (" (SIMULATED)" if hw.get("simulated") else "")),
        "INSIGHT": html.escape(insight),
    }
    tpl = open(os.path.join(ROOT, "docs", "pitch", "deck_template.html"), encoding="utf-8").read()
    for k, v in fill.items():
        tpl = tpl.replace("{{" + k + "}}", v)
    open(os.path.join(ROOT, "docs", "pitch", "deck.html"), "w", encoding="utf-8").write(tpl)

    # ---- RESULTS.md
    L = [f"# Measured results ({fill['DATE']})", "", f"Computer: {fill['HW']}", f"Test: {'quick' if d.get('quick') else 'full (3 repeats, median)'}, took {d.get('duration_s', 0)//60} minutes. Goal: {d.get('goal')}. Languages: {', '.join(LN.get(l, l) for l in d.get('languages', []))}.", "",
         f"## Headline", "", f"- **This computer can serve about {cap.get('n')} students comfortably** (simulated, tested up to {cap.get('tested_up_to')}; limits ≥ {cap.get('min_tps')} tokens/s typical, ≤ {cap.get('max_ttft')} s slow-case first word).",
         f"- Recommended: **{rec.get('label')}** ({rec.get('detail')}). {sel.get('reason')}",
         f"- Fast model for busy periods: {(sel.get('fast') or {}).get('label') or 'none (' + str(sel.get('fast_note')) + ')'}",
         f"- What measuring taught us: {insight}", "",
         "## All settings", "", "| setting | detail | threads | writing tokens/s | first word s | memory GB | noisy | EN | KN | HI | passed | note |", "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    rej = {x["key"]: x.get("rejected_why") for x in sel.get("rejected", [])}
    for r in rows:
        q = r.get("quality") or {}
        g = lambda l: f"{q[l]['acc']:.0f}" if l in q else "–"
        L.append(f"| {r.get('label')} | {r.get('detail')} | {r['config']['threads']} | {r.get('tps', 0):.1f} | {r.get('ttft', 0):.2f} | {r.get('peak_mem_gb', 0):.2f} | {'yes' if r.get('noisy') else ''} | {g('en')} | {g('kn')} | {g('hi')} | {r.get('quality_pass')} | {rej.get(r['key']) or r.get('quality_fail_why') or ''} |")
    L += ["", "## Capacity steps", "", "| students | answers | typical tokens/s | slow-case first word s | comfortable |", "|---|---|---|---|---|"]
    L += [f"| {s['students']} | {s['requests']} | {s['tps_med']} | {s['ttft_p95']} | {'yes' if s['ok'] else 'no'} |" for s in cap.get("steps", [])]
    L += ["", "## Quality per model file", ""]
    for f, qv in (d.get("quality") or {}).items():
        L.append(f"- {f}: " + "; ".join(f"{v['source']} {v['correct']}/{v['n']} ({v['acc']:.0f}%)" for v in qv["sets"].values()))
    if acc:
        L += ["", "## Acceptance tests", "", "See ACCEPTANCE.md."]
    L += ["", "Only these numbers go on slides. Re-run on the presentation laptop before the event."]
    open(os.path.join(ROOT, "docs", "evidence", "RESULTS.md"), "w", encoding="utf-8").write("\n".join(L))
    print("Wrote docs/evidence/RESULTS.md and docs/pitch/deck.html")


if __name__ == "__main__":
    main()
