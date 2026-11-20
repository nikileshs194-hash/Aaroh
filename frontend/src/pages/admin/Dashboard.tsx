import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeftRight, CircleAlert, HelpCircle, RefreshCw, RotateCw, ShieldCheck, Users, Zap } from "lucide-react";
import { api, fmt, live } from "../../api";
import { Button, Card, cx, Notice, Stat } from "../../components/ui";

const MODE_TONE: Record<string, string> = { quality: "bg-accent-soft text-accent", fast: "bg-warn/15 text-warn", protect: "bg-danger/10 text-danger" };

export default function Dashboard() {
  const { t } = useTranslation();
  const [pt, setPt] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [eng, setEng] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [why, setWhy] = useState<string>("");
  const [privacy, setPrivacy] = useState<any>(null);
  const [perf, setPerf] = useState<any[]>([]);
  const lastPush = useRef(0);

  const loadSlow = () => {
    api("/api/engines").then(setEng).catch(() => {});
    api("/api/privacy").then(setPrivacy).catch(() => {});
    api("/api/perf?minutes=5").then(setPerf).catch(() => {});
  };
  useEffect(() => {
    api("/api/metrics/history").then((h) => { setHist(h.slice(-300)); if (h.length) setPt(h[h.length - 1]); });
    api("/api/events?limit=40").then(setEvents);
    api("/api/settings").then(setSettings);
    loadSlow();
    const id = setInterval(loadSlow, 5000);
    const off = live((topic, data) => {
      if (topic === "live") {
        const now = Date.now();
        if (now - lastPush.current < 500) return; // at most twice a second (C6)
        lastPush.current = now;
        setPt(data);
        setHist((h) => [...h.slice(-299), data]);
      } else if (topic === "event") setEvents((e) => [data, ...e].slice(0, 60));
      else if (topic === "engine") api("/api/engines").then(setEng).catch(() => {});
    });
    return () => { off(); clearInterval(id); };
  }, []);

  const chart = useMemo(() => {
    const t0 = Date.now() / 1000 - 300;
    return perf.filter((p) => p.ts > t0 && p.kind !== "batch").map((p) => ({ x: Math.round(p.ts - t0), tps: Math.round(p.tps * 10) / 10, engine: p.engine }));
  }, [perf]);
  const memPct = pt ? (pt.mem_used_gb / pt.mem_total_gb) * 100 : 0;
  const maxT = settings?.max_ttft ?? 3, minS = settings?.min_tps ?? 5;
  const mode = pt?.mode || "quality";
  const decisions = events.filter((e) => ["switch", "restart", "error", "offline_check", "test", "privacy"].includes(e.type));
  const A = eng?.engines?.A, B = eng?.engines?.B, K = eng?.engines?.K;

  return (
    <div className="rise space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("nav.dashboard")}</h1>
        <span className={cx("badge px-3 py-1 text-sm", MODE_TONE[mode])}>
          {mode === "quality" ? <ShieldCheck size={14} /> : <Zap size={14} />}{t(`admin.mode_${mode}`)}
        </span>
      </div>
      {A && A.status !== "ready" && (
        <Notice tone="warn">
          {A.status === "starting" ? t("app.engineStarting") : "The AI engine is not running."}{" "}
          {eng?.active?.A ? <button className="font-semibold text-accent underline" onClick={() => api("/api/engines/restart", { body: {} }).then(loadSlow)}>{t("admin.restart")}</button>
            : <Link to="/setup/goal" className="font-semibold text-accent underline">Run the setup test</Link>}
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat big label={t("admin.usersNow")} value={pt?.users ?? 0} hint={<span className="inline-flex items-center gap-1"><Users size={14} />asked in the last 60 s · {pt?.active ?? 0} answering · {pt?.queued ?? 0} waiting</span>} />
        <Stat big label={t("admin.firstWord")} value={pt?.ttft_p95 != null ? fmt.n1(pt.ttft_p95) : "–"} unit="s"
          tone={pt?.ttft_p95 == null ? undefined : pt.ttft_p95 <= maxT ? "ok" : "danger"} hint={`slow case, last 30 s · limit ${maxT} s`} />
        <Stat big label={t("admin.speed")} value={pt?.tps_med != null ? fmt.n1(pt.tps_med) : "–"} unit="tok/s"
          tone={pt?.tps_med == null ? undefined : pt.tps_med >= minS ? "ok" : "danger"} hint={`per answer · limit ${minS}`} />
        <div className="card p-4">
          <div className="label">{t("admin.memory")}</div>
          <div className="mt-1 text-3xl font-bold tnum text-ink">{fmt.n1(pt?.mem_used_gb)}<span className="text-base font-semibold text-muted">/{pt?.mem_total_gb ?? "–"} GB</span></div>
          <div className="mt-2 h-2 rounded-full bg-sunken"><div className={cx("h-2 rounded-full", memPct > 90 ? "bg-danger" : "bg-accent")} style={{ width: `${memPct}%` }} /></div>
          <div className="mt-3 label">{t("admin.processor")}</div>
          <div className="mt-1 h-2 rounded-full bg-sunken"><div className={cx("h-2 rounded-full", (pt?.cpu ?? 0) > 90 ? "bg-warn" : "bg-accent")} style={{ width: `${pt?.cpu ?? 0}%` }} /></div>
          <div className="mt-1 text-sm tnum text-muted">{fmt.n0(pt?.cpu)}%</div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t("admin.speedChart")}</h2>
            <span className="text-xs text-muted">dashed line = comfort limit</span>
          </div>
          <div className="mt-3 h-56">
            {chart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ left: -18, right: 8, top: 6 }}>
                  <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgb(var(--accent))" stopOpacity={0.3} /><stop offset="1" stopColor="rgb(var(--accent))" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
                  <XAxis dataKey="x" type="number" domain={[0, 300]} ticks={[0, 60, 120, 180, 240, 300]} tickFormatter={(v) => `-${Math.round((300 - v) / 60)}m`} stroke="rgb(var(--muted))" fontSize={12} />
                  <YAxis stroke="rgb(var(--muted))" fontSize={12} />
                  <Tooltip contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8 }} formatter={(v: any) => [`${v} tok/s`, "speed"]} labelFormatter={() => ""} />
                  <ReferenceLine y={minS} stroke="rgb(var(--warn))" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="tps" stroke="rgb(var(--accent))" strokeWidth={2} fill="url(#g)" isAnimationActive={false} dot={{ r: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="flex h-full items-center justify-center text-sm text-muted">No answers in the last 5 minutes.</div>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button variant="ghost" icon={<HelpCircle size={16} />} onClick={() => api("/api/why-slow").then((r) => setWhy(r.text))}>{t("admin.whySlow")}</Button>
          </div>
          {why && <Notice className="mt-3">{why}</Notice>}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-semibold">{t("admin.timeline")}</h2>
          <ol className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
            {decisions.length === 0 && <li className="text-sm text-muted">{t("admin.noEvents")}</li>}
            {decisions.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-12 shrink-0 pt-0.5 text-xs font-semibold tnum text-muted">{fmt.time(e.ts)}</span>
                <span className={cx("mt-1 h-2 w-2 shrink-0 rounded-full", e.type === "switch" ? "bg-warn" : e.type === "error" ? "bg-danger" : e.type === "restart" ? "bg-teacher" : "bg-accent")} />
                <span className="text-sm text-text">{e.message}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {([["A", A, "Main model (English)"], ["K", K, "Kannada model"], ...(B?.status === "ready" ? [["B", B, t("admin.engineB")]] : [])] as any[]).map(([k, e, label]: any) => (
          <Card key={k}>
            <div className="flex items-center justify-between">
              <div className="label">{label}</div>
              <span className={cx("badge", e?.status === "ready" ? "bg-ok/10 text-ok" : e?.status === "starting" ? "bg-warn/10 text-warn" : "bg-sunken text-muted")}>
                {e?.status === "ready" ? t("admin.ready") : e?.status === "starting" ? t("admin.startingE") : e?.status === "crashed" ? t("admin.crashed") : t("admin.notRunning")}
              </span>
            </div>
            <div className="mt-2 truncate font-semibold text-ink">{e?.config?.model_file?.replace(".gguf", "") || "–"}</div>
            <div className="mt-1 text-sm text-muted tnum">
              {e?.config ? `${e.config.threads} threads · ${e.config.parallel} slots · ${fmt.n1(e.rss_gb)} GB` : k === "K" ? "Kannada questions use the main model" : ""}
              {e?.restarts ? ` · restarted ${e.restarts}×` : ""}
            </div>
          </Card>
        ))}
        <Card>
          <div className="label">Privacy and engine</div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <ShieldCheck size={16} className="text-ok" />
            <span>Outside connections: <b className="tnum">{privacy?.outside_count ?? 0}</b></span>
          </div>
          <Button variant="secondary" className="mt-3 w-full" icon={<RotateCw size={16} />} onClick={() => api("/api/engines/restart", { body: {} }).then(loadSlow)}>{t("admin.restart")}</Button>
        </Card>
      </div>
    </div>
  );
}
