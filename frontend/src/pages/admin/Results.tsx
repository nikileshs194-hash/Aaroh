import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { AlertTriangle, Download, Gauge, RefreshCw } from "lucide-react";
import { api, auth, fmt } from "../../api";
import { Button, Card, Chip, cx, Empty, Notice, Skeleton } from "../../components/ui";
import { langName } from "../../i18n";
import { PassportCard, CapacityHero } from "../setup/Setup";

export default function Results() {
  const { t } = useTranslation();
  const [r, setR] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [goal, setGoal] = useState("balanced");
  const load = () => api("/api/results").then((x) => { setR(x); if (x?.data?.selection?.goal) setGoal(x.data.selection.goal); });
  useEffect(() => { load(); api("/api/results/history").then(setHist); }, []);
  if (!r) return <Skeleton lines={10} />;
  if (r.empty) return <Empty icon={<Gauge size={30} />} title="No test has finished yet." action={<Link to="/setup/goal" className="btn-primary">{t("setup.startTest")}</Link>} />;

  const sel = r.data.selection || {}, cap = r.data.capacity || {};
  const recKey = sel.recommended?.key, fastKey = sel.fast?.key;
  const rejected: Record<string, string> = Object.fromEntries((sel.rejected || []).map((x: any) => [x.key, x.rejected_why]));
  const scores: Record<string, number> = Object.fromEntries((sel.scored || []).map((x: any) => [x.key, x.score]));
  const rows: any[] = r.results;
  const langs: string[] = (r.data.languages || ["en"]).filter((l: string) => l === "en" || l === "kn");
  const qn = Object.values(r.data.quality || {})[0] as any;
  const nPer = qn?.n || 30;
  const points = rows.filter((x) => !x.error && x.quality_score != null).map((x) => ({
    name: x.label, speed: x.tps, quality: x.quality_score, mem: x.peak_mem_gb, rec: x.key === recKey, rej: !!rejected[x.key],
  }));
  const qualityFiles = Object.values(r.data.quality || {}) as any[];

  return (
    <div className="rise space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.resultsTitle")}</h1>
          <p className="text-sm text-muted">Test finished {fmt.dateTime(r.data.finished)} · {r.data.quick ? "quick test (1 repeat)" : "full test (3 repeats, median)"} · took {fmt.minutes(r.data.duration_s)}
            {r.data.hardware?.simulated && <span className="badge ml-2 bg-warn/15 text-warn">{t("app.simulated")}</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary" href={`/api/results/export.csv?token=${encodeURIComponent(auth.token() || "")}`}><Download size={17} />{t("admin.exportCsv")}</a>
          <Link to="/setup/goal" className="btn-secondary"><RefreshCw size={17} />{t("admin.retest")}</Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="flex flex-col justify-center py-6">{cap.n != null ? <CapacityHero n={cap.n} upTo={cap.tested_up_to} ttft={cap.max_ttft} /> : <p className="text-muted">No capacity result.</p>}</Card>
        <Card className="lg:col-span-2">
          <div className="label">{t("setup.recSetup")}</div>
          <div className="mt-1 text-xl font-bold text-ink">{sel.recommended?.label || "–"}</div>
          <p className="mt-2">{sel.reason}</p>
          <p className="mt-2 text-sm text-muted">{t("setup.runnerUp")}: {sel.runner_up?.label || "–"} · {t("setup.fastModel")}: {sel.fast?.label || t(sel.fast_note === "already_fastest" ? "setup.alreadyFast" : "setup.noFast")}</p>
          <div className="mt-4 border-t border-line pt-3">
            <div className="label mb-2">{t("admin.goal")}</div>
            <div className="flex flex-wrap gap-2">
              {["fast", "balanced", "best"].map((g) => <Chip key={g} role="radio" selected={goal === g} onClick={async () => { setGoal(g); await api("/api/results/reselect", { body: { goal: g } }); load(); }}>{t(`setup.${g}`)}</Chip>)}
            </div>
            <p className="mt-2 text-xs text-muted">Changing the goal recomputes the recommendation from the saved measurements. Press "Use this setup" in Settings → or re-run setup to apply it.</p>
          </div>
        </Card>
      </div>

      <Card className="overflow-x-auto p-0 sm:p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-line bg-sunken text-left text-xs uppercase tracking-wide text-muted">
            <tr>{[t("admin.tblSetting"), t("admin.tblSpeed"), t("admin.tblFirst"), t("admin.tblMem"), t("admin.tblCpu"), ...langs.map((l) => langName(l)), t("admin.tblScore"), ""].map((h, i) => <th key={i} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key} className={cx("border-b border-line last:border-0", x.key === recKey && "bg-accent-soft/50")}>
                <td className="px-4 py-2.5"><div className="font-semibold text-ink">{x.label}</div><div className="text-xs text-muted">{x.detail} · {x.config?.threads} threads · ctx {x.config?.ctx} · batch {x.config?.batch}</div></td>
                <td className="px-4 py-2.5 tnum">{x.error ? "–" : `${fmt.n1(x.tps)} tok/s`}{x.noisy && <span className="badge ml-1 bg-warn/10 text-warn"><AlertTriangle size={11} />{t("admin.noisy")}</span>}</td>
                <td className="px-4 py-2.5 tnum">{x.error ? "–" : `${fmt.n1(x.ttft)} s`}</td>
                <td className="px-4 py-2.5 tnum">{x.error ? "–" : `${fmt.n1(x.peak_mem_gb)} GB`}</td>
                <td className="px-4 py-2.5 tnum">{x.cpu_avg != null ? `${fmt.n0(x.cpu_avg)}%` : "–"}</td>
                {langs.map((l) => { const q = x.quality?.[l]; return <td key={l} className="px-4 py-2.5 tnum">{q ? <>{fmt.n0(q.acc)}%{q.delta != null && q.delta !== 0 && <span className={cx("ml-1 text-xs", q.delta > 3 ? "text-danger" : "text-muted")}>({q.delta > 0 ? "−" : "+"}{fmt.n0(Math.abs(q.delta))})</span>}</> : "–"}</td>; })}
                <td className="px-4 py-2.5 tnum">{scores[x.key] != null ? scores[x.key].toFixed(2) : "–"}</td>
                <td className="px-4 py-2.5">
                  {x.key === recKey && <span className="badge bg-accent text-on-accent">{t("admin.recommendedTag")}</span>}
                  {x.key === fastKey && <span className="badge bg-warn/15 text-warn">{t("admin.fastTag")}</span>}
                  {(rejected[x.key] || x.error) && <span className="badge bg-danger/10 text-danger" title={rejected[x.key] || x.error}>{t("admin.rejected")}: {rejected[x.key] || "did not run"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">{t("admin.chartTitle")}</h2>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: -10, right: 16, top: 10, bottom: 10 }}>
                <CartesianGrid stroke="rgb(var(--line))" />
                <XAxis type="number" dataKey="speed" name="speed" unit=" t/s" stroke="rgb(var(--muted))" fontSize={12} label={{ value: "writing speed", position: "insideBottom", offset: -4, fontSize: 12, fill: "rgb(var(--muted))" }} />
                <YAxis type="number" dataKey="quality" name="quality" unit="%" stroke="rgb(var(--muted))" fontSize={12} domain={["auto", "auto"]} />
                <ZAxis type="number" dataKey="mem" range={[60, 600]} name="memory" unit=" GB" />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8 }} formatter={(v: any, n: any) => [v, n]} labelFormatter={() => ""} />
                <Scatter data={points}>
                  {points.map((p, i) => <Cell key={i} fill={p.rec ? "rgb(var(--accent))" : p.rej ? "rgb(var(--danger))" : "rgb(var(--muted))"} fillOpacity={p.rec ? 0.9 : 0.45} />)}
                  <LabelList dataKey="name" position="top" fontSize={10} fill="rgb(var(--muted))" />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted">Teal = recommended · red = rejected · grey = other passing settings.</p>
        </Card>
        <Card>
          <h2 className="font-semibold">{t("admin.capacityTitle")}</h2>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cap.steps || []} margin={{ left: -18, right: 8, top: 16 }}>
                <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
                <XAxis dataKey="students" stroke="rgb(var(--muted))" fontSize={12} />
                <YAxis stroke="rgb(var(--muted))" fontSize={12} />
                <Tooltip contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8 }} />
                <ReferenceLine y={cap.min_tps} stroke="rgb(var(--warn))" strokeDasharray="4 4" />
                <Bar dataKey="tps_med" name="typical tok/s per student" radius={[4, 4, 0, 0]}>
                  {(cap.steps || []).map((s: any, i: number) => <Cell key={i} fill={s.ok ? "rgb(var(--accent))" : "rgb(var(--muted))"} />)}
                  <LabelList dataKey="tps_med" position="top" fontSize={11} fill="rgb(var(--muted))" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="mt-3 w-full text-sm tnum">
            <thead className="text-left text-xs text-muted"><tr><th>{t("admin.capStudents")}</th><th>{t("admin.capSpeed")}</th><th>{t("admin.capFirst")}</th><th>answers</th></tr></thead>
            <tbody>{(cap.steps || []).map((s: any) => <tr key={s.students} className={s.ok ? "" : "text-muted"}><td>{s.students}</td><td>{fmt.n1(s.tps_med)} tok/s</td><td>{fmt.n1(s.ttft_p95)} s</td><td>{s.requests}</td></tr>)}</tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Each step: virtual students ask a classroom question, read, pause 10–30 s, ask again, for {cap.step_seconds} s. {cap.slots} parallel slots. Limits: ≥ {cap.min_tps} tok/s typical, ≤ {cap.max_ttft} s slow-case first word.</p>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold">{t("admin.qualityTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("admin.qualityNote", { n: nPer, pts: fmt.n1(100 / nPer) })} Sources: Belebele (reading, EN/HI/KN) and ARC-Easy (science, EN). The 8-bit version of each model is the reference.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {qualityFiles.map((q: any) => (
            <div key={q.model_file} className="rounded-ctl border border-line p-3">
              <div className="truncate text-sm font-semibold text-ink">{q.model_file.replace(".gguf", "")}</div>
              {Object.entries(q.sets || {}).map(([k, v]: any) => (
                <div key={k} className="mt-2">
                  <div className="flex justify-between text-xs"><span className="text-muted">{v.source}</span><span className="tnum font-semibold">{v.correct}/{v.n} · {fmt.n0(v.acc)}%</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-sunken"><div className={cx("h-1.5 rounded-full", v.acc >= 70 ? "bg-ok" : v.acc >= 45 ? "bg-warn" : "bg-danger")} style={{ width: `${v.acc}%` }} /></div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>

      {r.data.hardware && <PassportCard hw={r.data.hardware} compact />}

      {hist.length > 1 && (
        <Card>
          <h2 className="font-semibold">Test history</h2>
          <table className="mt-3 w-full text-sm">
            <tbody>{hist.map((h) => <tr key={h.id} className="border-b border-line last:border-0"><td className="py-2">{fmt.dateTime(h.ts)}</td><td>{h.quick ? "quick" : "full"}{h.simulated ? " · simulated" : ""}</td><td>{h.status}</td><td>{h.recommended || "–"}</td><td className="tnum">{h.n != null ? `serves ${h.n}` : ""}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
