import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CheckCircle2, Download, FileCheck2, KeyRound, Play, Printer, Radar, RefreshCw, ShieldCheck, Star, WifiOff, XCircle } from "lucide-react";
import { api, auth, fmt, stream } from "../../api";
import { Button, Card, Chip, cx, LangSwitcher, Markdown, Notice, Select, Skeleton, Stat, toast, Toggle, useCountUp } from "../../components/ui";
import { langName } from "../../i18n";
import { usePrefs } from "../../prefs";
import { ShareCard } from "../setup/Setup";

/* ---------------- Screen 12: Privacy proof */
export function Privacy() {
  const { t } = useTranslation();
  const [p, setP] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [self, setSelf] = useState<any>(null);
  const load = () => api("/api/privacy").then(setP);
  useEffect(() => { load(); const id = setInterval(load, 3000); return () => clearInterval(id); }, []);
  const n = useCountUp(p?.outside_count ?? 0);
  if (!p) return <Skeleton lines={8} />;
  const last = p.last_offline_check;
  return (
    <div className="rise space-y-5">
      <h1 className="text-2xl font-bold">{t("nav.privacy")}</h1>
      <Card className="py-8 text-center">
        <div className="label">{t("admin.privacyTitle")}</div>
        <div className={cx("mt-3 text-7xl font-bold tnum", n === 0 ? "text-ok" : "text-danger")}>{n}</div>
        <p className="mt-2 text-muted">{t("admin.watchedSince", { t: fmt.time(p.watching_since) })}</p>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted">{t("admin.howWeKnow")}: every second InferSmart reads the operating system's own list of network connections for its programs (the control centre and the AI engines) and counts any that go outside this computer or the school's private network. We count connections, not bytes.</p>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="label">{t("admin.offlineCheck")}</div>
          <div className={cx("mt-2 flex items-center gap-2 text-lg font-semibold", last ? (last.passed ? "text-ok" : "text-danger") : "text-muted")}>
            {last ? (last.passed ? <CheckCircle2 size={20} /> : <XCircle size={20} />) : null}
            {last ? (last.passed ? t("admin.passedAt", { t: fmt.dateTime(last.ts) }) : t("admin.failedCheck")) : t("admin.notYet")}
          </div>
          {last && <p className="mt-1 text-sm text-muted">{last.detail}</p>}
          <Button className="mt-3 w-full" variant="secondary" loading={busy === "off"} icon={<WifiOff size={16} />} onClick={async () => { setBusy("off"); await api("/api/privacy/offline-check", { body: {} }); await load(); setBusy(""); }}>{t("admin.runOffline")}</Button>
        </Card>
        <Card>
          <div className="label">{t("admin.chatsStored")}</div>
          <div className="mt-2 text-lg font-semibold text-ok">{t("admin.none")}</div>
          <p className="mt-1 text-sm text-muted">{t("admin.onlyNumbers")}. Students' chats live only in their own browser and can be cleared with one tap.</p>
        </Card>
        <Card>
          <div className="label">{t("admin.selftest")}</div>
          <p className="mt-2 text-sm text-muted">Deliberately opens one outside connection to prove the watcher catches it. It is logged separately and does not count as normal use.</p>
          {self && <Notice tone={self.caught ? "ok" : "warn"} className="mt-2">{self.caught ? t("admin.selftestOk") : t("admin.selftestNo")}</Notice>}
          <Button className="mt-3 w-full" variant="secondary" loading={busy === "self"} icon={<Radar size={16} />} onClick={async () => { setBusy("self"); setSelf(await api("/api/privacy/selftest", { body: {} })); setBusy(""); }}>{t("admin.selftest")}</Button>
        </Card>
      </div>
      <Link to="/print/privacy" target="_blank" className="btn-primary"><Printer size={18} />{t("admin.printReport")}</Link>
    </div>
  );
}

/* ---------------- Screen 13: Principal summary */
export function SummaryView({ s }: { s: any }) {
  const { t } = useTranslation();
  const langs = Object.entries(s.languages || {});
  const Row = ({ label, value, how, tone }: { label: string; value: ReactNode; how: string; tone?: "ok" | "warn" }) => (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className={cx("mt-1 text-3xl font-bold tnum", tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-ink")}>{value}</div>
      <div className="mt-2 text-xs text-muted"><b>{t("admin.howWeKnow")}:</b> {how}</div>
    </div>
  );
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Row label={t("admin.servesAtOnce")} value={s.capacity_n != null ? t("setup.students", { n: s.capacity_n }) : "–"} how={`simulated classroom test, up to ${s.tested_up_to ?? "–"} students, on ${fmt.date(s.test_date)}${s.simulated ? " (classroom PC simulator)" : ""}`} />
        <Row label={t("admin.worksOffline")} value={s.works_offline ? t("app.yes") : t("admin.notYet")} tone={s.works_offline ? "ok" : "warn"} how={s.last_offline_check ? `offline check passed at ${fmt.dateTime(s.last_offline_check.ts)}` : "run the offline check on the Privacy page"} />
        <Row label={t("admin.dataLeaving")} value={s.outside_connections === 0 ? t("admin.none") : s.outside_connections} tone={s.outside_connections === 0 ? "ok" : "warn"} how={`outside connections counted every second since ${fmt.dateTime(s.watching_since)}`} />
        <Row label={t("admin.chatsStored")} value={t("admin.none")} tone="ok" how="only speed numbers are logged; no question or answer text is saved on this computer" />
        <Row label={t("admin.plansPrepared")} value={s.plans_this_week} how={`saved in the Teacher Studio library; ${s.answers_this_week} answers given this week`} />
        <Row label="Running model" value={<span className="text-xl">{s.model || "–"}</span>} how="chosen automatically from measurements on this computer" />
      </div>
      <div className="card mt-3 p-4">
        <div className="label">{t("admin.languagesTested")}</div>
        <p className="mt-2 text-text">
          {langs.length ? langs.map(([l, v]: any, i) => <span key={l}>{i > 0 && ", "}<b>{langName(l)}</b> ({v.label}, {fmt.n0(v.acc)}% on {v.n} questions{v.review ? ", teacher review on" : ""})</span>) : "–"}.
        </p>
        <p className="mt-2 text-xs text-muted">Multiple-choice accuracy on public test sets. Small samples: indicators, not proof. AI can make mistakes; teachers review material before use.</p>
      </div>
    </div>
  );
}

export function Summary() {
  const { t } = useTranslation();
  const [s, setS] = useState<any>(null);
  useEffect(() => { api("/api/summary").then(setS); }, []);
  if (!s) return <Skeleton lines={8} />;
  return (
    <div className="rise space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{t("admin.summaryTitle")}</h1><p className="text-muted">{s.school_name} · week of {fmt.date(Date.now() / 1000 - 6 * 86400)}</p></div>
        <Link to="/print/summary" target="_blank" className="btn-primary"><Printer size={18} />{t("app.print")}</Link>
      </div>
      <SummaryView s={s} />
    </div>
  );
}

/* ---------------- Share */
export function Share() {
  const { t } = useTranslation();
  const [s, setS] = useState<any>(null);
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => { api("/api/share").then(setS); }, []);
  if (!s) return <Skeleton lines={6} />;
  return (
    <div className="rise space-y-5">
      <h1 className="text-2xl font-bold">{t("admin.shareTitle")}</h1>
      <ShareCard share={s} teacherCode={code} />
      {s.addresses.length > 1 && <Notice>Other addresses on this computer: {s.addresses.slice(1).map((a: any) => `${a.ip} (${a.interface})`).join(", ")}</Notice>}
      <Card>
        <div className="label">{t("setup.teacherCode")}</div>
        <p className="mt-1 text-sm text-muted">The code is stored only as a secure hash, so it cannot be shown again. Make a new one if teachers have forgotten it.</p>
        <Button className="mt-3" variant="secondary" icon={<KeyRound size={16} />} onClick={async () => { const r = await api("/api/settings/teacher-code", { body: {} }); setCode(r.code); }}>{t("admin.newCode")}</Button>
      </Card>
    </div>
  );
}

/* ---------------- Settings (Screen 14) */
export function SettingsPage() {
  const { t } = useTranslation();
  const prefs = usePrefs();
  const [s, setS] = useState<any>(null);
  const [hw, setHw] = useState<any>(null);
  const [models, setModels] = useState<any>(null);
  const [pin, setPin] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [blocked, setBlocked] = useState("");
  useEffect(() => {
    api("/api/settings").then((x) => { setS(x); setBlocked((x.blocked_topics || []).join("\n")); });
    api("/api/hardware").then(setHw);
    api("/api/models").then(setModels);
  }, []);
  if (!s) return <Skeleton lines={10} />;
  const put = async (patch: any) => { setS({ ...s, ...patch }); await api("/api/settings", { method: "PUT", body: patch }); toast(t("admin.saved")); };
  const reset = async (keys: string[]) => { await api("/api/settings/reset", { body: { keys } }); setS(await api("/api/settings")); toast(t("admin.saved")); };
  const Section = ({ title, children }: { title: string; children: ReactNode }) => <Card><h2 className="mb-2 text-lg font-semibold">{title}</h2>{children}</Card>;
  const Num = ({ k, label, step = 0.5, min = 0 }: { k: string; label: string; step?: number; min?: number }) => (
    <label className="flex items-center justify-between gap-4 py-2"><span className="text-text">{label}</span>
      <input type="number" className="input w-28 tnum" step={step} min={min} defaultValue={s[k]} onBlur={(e) => put({ [k]: Number(e.target.value) })} /></label>
  );
  return (
    <div className="rise space-y-5">
      <h1 className="text-2xl font-bold">{t("admin.settingsTitle")}</h1>
      <Section title={t("admin.comfort")}>
        <p className="text-sm text-muted">These decide "serves N students" and when InferSmart switches to the fast model.</p>
        <Num k="min_tps" label={t("admin.minTps")} />
        <Num k="max_ttft" label={t("admin.maxTtft")} />
        <Num k="quality_margin" label={t("admin.qualityMargin")} />
        <Num k="quality_floor" label={t("admin.qualityFloor")} step={1} />
        <button className="btn-ghost -ml-3 text-sm" onClick={() => reset(["min_tps", "max_ttft", "quality_margin", "quality_floor"])}>{t("app.resetRecommended")}</button>
      </Section>
      <Section title={t("admin.classroom")}>
        <Toggle id="exam" checked={!!s.exam_mode} onChange={(v) => put({ exam_mode: v })} label={t("admin.examMode")} hint="Students see a polite message instead of the chat. Teachers can still use Teacher Studio." />
        <label className="mt-2 block"><span className="mb-1 block text-sm font-medium text-muted">{t("admin.blocked")}</span>
          <textarea className="input min-h-[90px] py-2" value={blocked} onChange={(e) => setBlocked(e.target.value)} onBlur={() => put({ blocked_topics: blocked.split("\n").map((x) => x.trim()).filter(Boolean) })} /></label>
        <label className="mt-3 block"><span className="mb-1 block text-sm font-medium text-muted">{t("admin.wifiName")}</span>
          <input className="input" defaultValue={s.wifi_name} onBlur={(e) => put({ wifi_name: e.target.value })} /></label>
        <label className="mt-3 block"><span className="mb-1 block text-sm font-medium text-muted">{t("setup.schoolName")}</span>
          <input className="input" defaultValue={s.school_name} onBlur={(e) => put({ school_name: e.target.value })} /></label>
      </Section>
      <Section title={t("admin.security")}>
        <p className="text-sm text-muted">Classroom-grade protection: codes are stored as secure hashes and lock for 5 minutes after 5 wrong tries. Not bank-grade.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block"><span className="mb-1 block text-sm font-medium text-muted">{t("admin.newPin")}</span>
            <input className="input w-40 font-mono" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} /></label>
          <Button variant="secondary" disabled={pin.length < 4} onClick={async () => { await api("/api/settings/pin", { body: { pin } }); setPin(""); toast(t("admin.saved")); }}>{t("admin.changePin")}</Button>
          <Button variant="secondary" icon={<KeyRound size={16} />} onClick={async () => setCode((await api("/api/settings/teacher-code", { body: {} })).code)}>{t("admin.newCode")}</Button>
        </div>
        {code && <Notice className="mt-3">{t("setup.teacherCodeBody", { code })}</Notice>}
      </Section>
      <Section title={t("admin.startup")}>
        <Toggle id="as" checked={!!s.autostart} onChange={(v) => put({ autostart: v })} label={t("admin.autostart")} />
        <Toggle id="asl" checked={!!s.autostart_on_login} onChange={async (v) => { const r = await api("/api/settings/autostart-login", { body: { enabled: v } }); setS({ ...s, autostart_on_login: r.enabled }); }} label={t("admin.autostartLogin")} hint="Adds InferSmart to this Windows user's start-up folder." />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Play size={16} />} onClick={async () => { await api("/api/apply", { body: {} }); toast(t("admin.saved")); }}>{t("setup.useThis")}</Button>
          <Link to="/setup/goal" className="btn-secondary"><RefreshCw size={16} />{t("admin.retest")}</Link>
          <a className="btn-secondary" href={`/api/backup?token=${encodeURIComponent(auth.token() || "")}`}><Download size={16} />{t("admin.backup")}</a>
        </div>
      </Section>
      <Section title={t("admin.appearance")}>
        <div className="space-y-4">
          <div><div className="label mb-2">{t("app.language")}</div><LangSwitcher /></div>
          <div><div className="label mb-2">{t("app.theme")}</div><div className="flex gap-2">{(["light", "dark", "contrast"] as const).map((th) => <Chip key={th} role="radio" selected={prefs.theme === th} onClick={() => prefs.setTheme(th)}>{t(`app.${th}`)}</Chip>)}</div></div>
          <div><div className="label mb-2">{t("app.textSize")}</div><div className="flex gap-2">{[100, 125, 150].map((n) => <Chip key={n} role="radio" selected={prefs.size === n} onClick={() => prefs.setSize(n)}>{n}%</Chip>)}</div></div>
        </div>
      </Section>
      <Section title={t("admin.simulator")}>
        <p className="text-sm text-muted">{t("admin.simHint")}</p>
        {hw && <SimForm hw={hw} onChange={setHw} />}
      </Section>
      <Section title={t("admin.models")}>
        {models ? (
          <div className="divide-y divide-line">
            {models.models.map((m: any) => (
              <div key={m.file} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1"><div className="font-semibold text-ink">{m.name} · {m.quality_label}</div><div className="text-xs text-muted">{m.file} · {m.size_gb} GB file · needs about {m.est_mem_gb} GB · {m.licence}</div></div>
                {m.fits ? <span className="badge bg-ok/10 text-ok">fits</span> : <span className="badge bg-warn/10 text-warn">needs more memory than this computer can spare</span>}
                <Button variant="ghost" className="min-h-[36px] text-sm" icon={<FileCheck2 size={15} />} onClick={async () => { const r = await api("/api/models/verify", { body: { file: m.file } }); toast(r.reason, r.ok ? "ok" : "warn"); }}>Verify</Button>
              </div>
            ))}
          </div>
        ) : <Skeleton lines={4} />}
      </Section>
      <Section title={t("admin.lockMode")}>
        <p className="text-sm text-muted">Automatic is recommended. Locking keeps one mode even when the class is busy.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[null, "quality", "fast", "protect"].map((m) => <Chip key={String(m)} role="radio" selected={(s.lock_mode ?? null) === m} onClick={async () => { await api("/api/mode/lock", { body: { mode: m } }); setS({ ...s, lock_mode: m }); }}>{m ?? t("admin.auto")}</Chip>)}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-accent">{t("app.showDetails")}</summary>
          <div className="mt-3 space-y-2">
            <Num k="slots" label="Parallel answers per engine (slots)" step={1} min={1} />
            <Num k="ctx_per_slot" label="Context length per slot (tokens)" step={512} min={512} />
            <p className="text-xs text-muted">Changes apply the next time the engine starts. <Link className="text-accent" to="/admin">Restart from the dashboard.</Link></p>
          </div>
        </details>
      </Section>
    </div>
  );
}

function SimForm({ hw, onChange }: { hw: any; onChange: (h: any) => void }) {
  const real = hw.real || hw;
  const [on, setOn] = useState(!!hw.simulated);
  const [cores, setCores] = useState(String(hw.simulated ? hw.cores : 4));
  const [mem, setMem] = useState(String(hw.simulated ? hw.mem_total_gb : 8));
  const apply = async (enabled: boolean) => { setOn(enabled); onChange(await api("/api/hardware/simulator", { body: { enabled, cores: Number(cores), mem_gb: Number(mem) } })); };
  return (
    <div>
      <Toggle id="sim" checked={on} onChange={apply} label="Imitate an older school PC" hint={`Real: ${real.cores} cores, ${real.mem_total_gb} GB`} />
      <div className="grid grid-cols-2 gap-3">
        <Select id="simc" label="Cores" value={cores} onChange={setCores} options={["2", "4", "6", "8"].map((v) => ({ value: v, label: v }))} />
        <Select id="simm" label="Memory (GB)" value={mem} onChange={setMem} options={["4", "6", "8", "12"].map((v) => ({ value: v, label: v }))} />
      </div>
      {on && <Button className="mt-3" variant="secondary" onClick={() => apply(true)}>Apply limits</Button>}
      {on && <Notice tone="warn" className="mt-3">Simulator on. Re-run the test to see results for this imitated PC; they will be labelled "Simulated".</Notice>}
    </div>
  );
}

/* ---------------- Teacher ratings (quality guard step 5) */
export function Ratings() {
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<any[]>([]);
  const [sum, setSum] = useState<any>(null);
  const [idx, setIdx] = useState(0);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [sc, setSc] = useState({ correctness: 0, clarity: 0, suitability: 0 });
  const [rater, setRater] = useState(auth.teacherName());
  const [model, setModel] = useState("");
  useEffect(() => { api("/api/ratings/prompts").then(setPrompts); api("/api/ratings/summary").then(setSum); }, []);
  const p = prompts[idx];
  const gen = async () => {
    setOut(""); setBusy(true); setSc({ correctness: 0, clarity: 0, suitability: 0 });
    let acc = "";
    await stream("/api/studio/generate", { template: p.template, fields: p.fields }, (e) => {
      if (e.type === "token") { acc += e.text; setOut(acc); }
      if (e.type === "start") setModel(e.model || "");
    });
    setBusy(false);
  };
  const save = async () => {
    await api("/api/ratings", { body: { ...sc, prompt_id: p.id, model, rater } });
    toast(t("admin.saved"));
    setSum(await api("/api/ratings/summary"));
    setIdx((i) => (i + 1) % prompts.length); setOut("");
  };
  const Stars = ({ k }: { k: keyof typeof sc }) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span>{t(`admin.${k}`)}</span>
      <div className="flex gap-1" role="radiogroup" aria-label={t(`admin.${k}`)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={sc[k] === n} aria-label={`${n}`} onClick={() => setSc({ ...sc, [k]: n })}
            className={cx("flex h-10 w-10 items-center justify-center rounded-ctl border", sc[k] >= n ? "border-warn bg-warn/10 text-warn" : "border-line text-muted")}>
            <Star size={18} fill={sc[k] >= n ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="rise space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.ratingsTitle")}</h1>
        <p className="text-muted">{t("admin.ratingsBody")}</p>
      </div>
      {sum && sum.count > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Ratings" value={sum.count} hint={t("admin.ratingsSummary", { count: sum.count, raters: sum.raters })} />
          <Stat label={t("admin.correctness")} value={sum.correctness} unit="/5" />
          <Stat label={t("admin.clarity")} value={sum.clarity} unit="/5" />
          <Stat label={t("admin.suitability")} value={sum.suitability} unit="/5" />
        </div>
      )}
      {p && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="label">{idx + 1} / {prompts.length}</div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setIdx((i) => (i + prompts.length - 1) % prompts.length); setOut(""); }}>←</Button>
              <Button variant="ghost" onClick={() => { setIdx((i) => (i + 1) % prompts.length); setOut(""); }}>→</Button>
            </div>
          </div>
          <h2 className="mt-1 text-lg font-semibold">{p.title} · {langName(p.fields.language)}</h2>
          {!out && <Button className="mt-3" loading={busy} onClick={gen}>{t("admin.generate")}</Button>}
          {out && <div lang={p.fields.language} className="mt-3 max-h-96 overflow-y-auto rounded-ctl border border-line p-3"><Markdown text={out} className={busy ? "caret" : ""} /></div>}
          {out && !busy && (
            <div className="mt-4 border-t border-line pt-3">
              <Stars k="correctness" /><Stars k="clarity" /><Stars k="suitability" />
              <label className="mt-2 block"><span className="mb-1 block text-sm text-muted">{t("admin.rater")}</span><input className="input" value={rater} onChange={(e) => setRater(e.target.value)} /></label>
              <Button className="mt-3" disabled={!sc.correctness || !sc.clarity || !sc.suitability || !rater.trim()} onClick={save}>{t("admin.submit")}</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
