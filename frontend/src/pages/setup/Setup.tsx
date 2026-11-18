import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useNavigate, Link } from "react-router-dom";
import { ArrowRight, BatteryWarning, Check, ChevronDown, ChevronUp, Copy, Cpu, Gauge, HardDrive, LayoutDashboard, MemoryStick, MessageSquare, Pause, Play, Printer, ShieldCheck, Sparkles, Timer, Users, Zap } from "lucide-react";
import { api, auth, fmt, live } from "../../api";
import { Button, Card, Chip, cx, LangSwitcher, Logo, Notice, Progress, Ring, RunningBadge, Skeleton, Stepper, toast, useCountUp } from "../../components/ui";
import QR from "../../components/QR";
import { langName } from "../../i18n";

function Frame({ step, children, wide = false }: { step: number; children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-[100dvh] bg-bg">
      <header className="border-b border-line bg-surface">
        <div className={cx("mx-auto flex items-center justify-between gap-4 px-4 py-3", wide ? "max-w-5xl" : "max-w-3xl")}>
          <Logo />
          <span className="text-sm text-muted">{t("setup.step", { n: step })}</span>
        </div>
      </header>
      <main className={cx("mx-auto px-4 py-6 sm:py-10", wide ? "max-w-5xl" : "max-w-3xl")}>
        <div className="mb-8"><Stepper step={step} /></div>
        <div className="rise">{children}</div>
      </main>
    </div>
  );
}

/* ---------------- Screen 1: Welcome */
function Welcome() {
  const { t } = useTranslation();
  const nav = useNavigate();
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-bg px-4 py-10">
      <div className="rise w-full max-w-xl text-center">
        <div className="flex justify-center"><Logo size={44} /></div>
        <h1 className="mt-8 text-3xl font-bold sm:text-4xl">{t("setup.welcomeTitle")}</h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-muted">{t("setup.welcomeBody")}</p>
        <div className="mt-8 flex justify-center"><LangSwitcher /></div>
        <Button size="lg" className="mt-8 w-full sm:w-auto" icon={<Cpu size={20} />} onClick={() => { api("/api/setup/step", { body: { setup_step: "passport" } }); nav("/setup/passport"); }}>
          {t("setup.checkComputer")}
        </Button>
        <p className="mt-4 text-sm text-muted">{t("setup.step", { n: 1 })} · {t("setup.canStop")}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={16} className="text-ok" />No internet needed</span>
          <span className="inline-flex items-center gap-1.5"><Users size={16} className="text-accent" />Phones and lab PCs</span>
          <span className="inline-flex items-center gap-1.5"><Sparkles size={16} className="text-teacher" />English · ಕನ್ನಡ · हिन्दी</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Screen 2: Hardware Passport */
export function PassportCard({ hw, compact = false }: { hw: any; compact?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <div className="border-b border-line bg-accent-soft/60 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="label text-accent">{t("setup.passport")}</div>
          <span className="font-mono text-xs text-muted">ID {hw.passport_id}</span>
        </div>
        <div className="mt-1 text-xl font-bold text-ink sm:text-2xl">
          {t(`setup.class_${hw.class}`)} <span className="font-normal text-muted">· {t(`setup.classLine_${hw.class}`)}</span>
        </div>
        {hw.simulated && <span className="badge mt-2 bg-warn/15 text-warn">{t("app.simulated")}</span>}
      </div>
      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
        {[
          { icon: <Cpu size={18} />, k: hw.cpu, v: `${t("setup.cores", { n: hw.cores })} · ${t("setup.threads", { n: hw.threads })}` },
          { icon: <MemoryStick size={18} />, k: t("setup.memory", { n: hw.mem_total_gb }), v: `${hw.mem_free_gb} GB free now` },
          { icon: <HardDrive size={18} />, k: t("setup.diskFree", { n: hw.disk_free_gb }), v: hw.os },
          { icon: <Zap size={18} />, k: t("setup.fastMaths"), v: hw.avx512 ? "AVX-512" : hw.avx2 ? "AVX2" : hw.neon ? "NEON" : "basic" },
        ].map((x, i) => (
          <div key={i} className="bg-surface px-4 py-3">
            <div className="flex items-center gap-2 text-accent">{x.icon}</div>
            <div className="mt-1.5 text-sm font-semibold text-ink leading-snug">{x.k}</div>
            <div className="text-xs text-muted">{x.v}</div>
          </div>
        ))}
      </div>
      {!compact && (
        <div className="px-5 py-4">
          <div className="label">{t("setup.meaningTitle")}</div>
          <p className="mt-1 text-text">{t("setup.meaning", { b: hw.max_params_b })}</p>
          <button className="btn-ghost mt-2 -ml-3 text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{open ? t("app.hideDetails") : t("app.showDetails")}
          </button>
          {open && (
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-ctl bg-sunken p-3 font-mono text-xs sm:grid-cols-3">
              {Object.entries(hw).filter(([k]) => !["real", "scanned_at"].includes(k)).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2"><dt className="text-muted">{k}</dt><dd className="text-text">{String(v)}</dd></div>
              ))}
            </dl>
          )}
        </div>
      )}
    </Card>
  );
}

function Passport() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [hw, setHw] = useState<any>(null);
  useEffect(() => { api("/api/hardware").then(setHw); }, []);
  return (
    <Frame step={1}>
      <h1 className="text-2xl font-bold sm:text-3xl">{t("setup.passport")}</h1>
      <div className="mt-6">{hw ? <PassportCard hw={hw} /> : <Card><Skeleton lines={5} /></Card>}</div>
      {hw?.on_battery && <Notice tone="warn" className="mt-4"><BatteryWarning size={16} className="inline mr-1" />{t("setup.battery")}</Notice>}
      {hw?.simulated && <Notice tone="warn" className="mt-4">{t("setup.simOn")}</Notice>}
      <div className="mt-8 flex justify-between gap-3">
        <Button variant="secondary" onClick={() => nav("/setup")}>{t("app.back")}</Button>
        <Button disabled={!hw} icon={<ArrowRight size={18} />} onClick={() => { api("/api/setup/step", { body: { setup_step: "goal" } }); nav("/setup/goal"); }}>{t("app.next")}</Button>
      </div>
    </Frame>
  );
}

/* ---------------- Screen 3: Goal */
function Goal() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [size, setSize] = useState("class");
  const [langs, setLangs] = useState<string[]>(["en", "kn", "hi"]);
  const [goal, setGoal] = useState("balanced");
  const [quick, setQuick] = useState(true);
  const [saved, setSaved] = useState<any>(null);
  const [starting, setStarting] = useState(false);
  useEffect(() => { api("/api/results").then((r) => !r.empty && setSaved(r)).catch(() => {}); }, []);
  const toggleLang = (l: string) => setLangs((x) => x.includes(l) ? (x.length > 1 ? x.filter((y) => y !== l) : x) : [...x, l]);
  const start = async () => {
    setStarting(true);
    try {
      await api("/api/test/start", { body: { goal, class_size: size, languages: langs, quick } });
      await api("/api/setup/step", { body: { setup_step: "test", goal, class_size: size, languages: langs } });
      nav("/setup/test");
    } catch (e: any) {
      if (e.status === 409) nav("/setup/test"); else toast(e.message, "warn");
    } finally { setStarting(false); }
  };
  const Big = ({ v, title, sub, icon }: { v: string; title: string; sub: string; icon: ReactNode }) => (
    <button role="radio" aria-checked={size === v} onClick={() => setSize(v)}
      className={cx("card flex flex-col items-start gap-1 p-4 text-left transition-colors", size === v ? "border-accent ring-2 ring-accent/30 bg-accent-soft/40" : "hover:bg-sunken")}>
      <span className="text-accent">{icon}</span>
      <span className="text-xl font-bold text-ink">{title}</span>
      <span className="text-sm text-muted">{sub}</span>
    </button>
  );
  return (
    <Frame step={2}>
      <h1 className="text-2xl font-bold sm:text-3xl">{t("setup.howMany")}</h1>
      <div role="radiogroup" className="mt-4 grid grid-cols-3 gap-3">
        <Big v="small" title="1–10" sub={t("setup.small")} icon={<Users size={20} />} />
        <Big v="class" title="10–25" sub={t("setup.one")} icon={<Users size={20} />} />
        <Big v="lab" title="25+" sub={t("setup.lab")} icon={<Users size={20} />} />
      </div>
      <h2 className="mt-8 text-lg font-semibold">{t("setup.whichLangs")}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {["en", "kn", "hi"].map((l) => <Chip key={l} selected={langs.includes(l)} onClick={() => toggleLang(l)}><span lang={l}>{langName(l)}</span></Chip>)}
      </div>
      <h2 className="mt-8 text-lg font-semibold">{t("setup.whatMatters")}</h2>
      <div role="radiogroup" className="mt-3 flex flex-wrap gap-2">
        <Chip role="radio" selected={goal === "fast"} onClick={() => setGoal("fast")}>{t("setup.fast")}</Chip>
        <Chip role="radio" selected={goal === "balanced"} onClick={() => setGoal("balanced")}>{t("setup.balanced")} <span className="opacity-80">({t("setup.recommended")})</span></Chip>
        <Chip role="radio" selected={goal === "best"} onClick={() => setGoal("best")}>{t("setup.best")}</Chip>
      </div>
      <h2 className="mt-8 text-lg font-semibold">{t("setup.testKind")}</h2>
      <div role="radiogroup" className="mt-3 grid gap-3 sm:grid-cols-2">
        {[{ v: true, ti: t("setup.quick"), h: t("setup.quickHint") }, { v: false, ti: t("setup.full"), h: t("setup.fullHint") }].map((o) => (
          <button key={String(o.v)} role="radio" aria-checked={quick === o.v} onClick={() => setQuick(o.v)}
            className={cx("card p-4 text-left", quick === o.v ? "border-accent ring-2 ring-accent/30" : "hover:bg-sunken")}>
            <div className="font-semibold text-ink">{o.ti}</div><div className="text-sm text-muted">{o.h}</div>
          </button>
        ))}
      </div>
      {saved && (
        <Notice className="mt-6">
          {t("setup.savedHint", { date: fmt.dateTime(saved.data?.finished) })}{" "}
          <button className="font-semibold text-accent underline" onClick={() => nav("/setup/result")}>{t("setup.loadSaved")}</button>
        </Notice>
      )}
      <div className="mt-8 flex justify-between gap-3">
        <Button variant="secondary" onClick={() => nav("/setup/passport")}>{t("app.back")}</Button>
        <Button size="lg" loading={starting} icon={<Gauge size={20} />} onClick={start}>{t("setup.startTest")}</Button>
      </div>
    </Frame>
  );
}

/* ---------------- Screen 4: Live test */
function Testing() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [p, setP] = useState<any>(null);
  useEffect(() => {
    api("/api/test/progress").then(setP).catch(() => {});
    const off = live((topic, data) => { if (topic === "test") setP({ ...data }); });
    const id = setInterval(() => api("/api/test/progress").then(setP).catch(() => {}), 10000);
    return () => { off(); clearInterval(id); };
  }, []);
  useEffect(() => { if (p?.status === "done") { const id = setTimeout(() => nav("/setup/result"), 1200); return () => clearTimeout(id); } }, [p?.status]);

  if (!p) return <Frame step={3}><Card><Skeleton lines={6} /></Card></Frame>;
  const pct = p.units_total ? Math.min(99, ((p.units_done || 0) + (p.phase === "quality" && p.q_total ? p.q_done / p.q_total : 0)
    + (p.phase === "capacity" ? ((p.cap_steps?.length || 0) / 7) : 0)) / p.units_total * 100) : 0;
  const settings: any[] = p.settings || [];
  const stopped = p.status === "stopped" || p.status === "error";
  const headline = p.phase === "quality" ? t("setup.checkingQuality", { m: p.current || "" })
    : p.phase === "capacity" ? t("setup.measuringCapacity", { n: (p.cap_steps?.[p.cap_steps.length - 1]?.students ?? 1) })
    : t("setup.testing", { i: p.index || 1, n: p.total || "…" });
  return (
    <Frame step={3} wide>
      <Card className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <Ring value={p.status === "done" ? 100 : pct} size={104} />
        <div className="flex-1 text-center sm:text-left">
          <h1 className="text-xl font-bold sm:text-2xl">{p.status === "done" ? t("setup.done") : headline}</h1>
          {!stopped && p.status !== "done" && <p className="mt-1 text-muted"><Timer size={15} className="mr-1 inline" />{t("setup.timeLeft", { t: p.eta_s ? fmt.minutes(p.eta_s) : "…" })}</p>}
          {stopped && <p className="mt-1 text-warn">{t("setup.paused")}</p>}
          {p.phase === "speed" && p.current && <p className="mt-1 text-sm text-muted">{p.current} · {p.current_detail}</p>}
        </div>
        <div>
          {stopped
            ? <Button icon={<Play size={18} />} onClick={() => api("/api/test/resume", { body: {} }).then(() => setP({ ...p, status: "running" }))}>{t("setup.resume")}</Button>
            : p.status !== "done" && <Button variant="secondary" icon={<Pause size={18} />} onClick={() => api("/api/test/stop", { body: {} })}>{t("setup.stop")}</Button>}
        </div>
      </Card>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {settings.map((s, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="label truncate">{s.label}</div>
              {s.error ? <span className="badge bg-danger/10 text-danger">{t("setup.failed")}</span> : <span className="badge bg-ok/10 text-ok"><Check size={12} />{t("setup.done")}</span>}
            </div>
            <div className="mt-0.5 text-xs text-muted">{s.detail}</div>
            {!s.error && <div className="mt-2 text-sm"><span className="text-muted">{t("setup.writingSpeed")} </span><span className="font-semibold tnum text-ink">{t("setup.wordsPerSec", { n: fmt.n1(s.tps) })}</span></div>}
          </Card>
        ))}
        {p.phase === "speed" && p.status !== "done" && (
          <Card className="border-accent/50 p-4">
            <div className="label text-accent">{p.current || "…"}</div>
            <div className="mt-0.5 text-xs text-muted">{p.current_detail}</div>
            <div className="mt-2 text-sm text-accent">{t("setup.testingNow")}</div>
          </Card>
        )}
        {p.phase === "capacity" && (p.cap_steps || []).map((s: any) => (
          <Card key={"c" + s.students} className="p-4">
            <div className="label">{t("setup.students", { n: s.students })}</div>
            <div className="mt-2 text-sm tnum">{fmt.n1(s.tps_med)} tok/s · {fmt.n1(s.ttft_p95)} s</div>
            <span className={cx("badge mt-2", s.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn")}>{s.ok ? "comfortable" : "too slow"}</span>
          </Card>
        ))}
      </div>
      {p.preview && p.phase === "speed" && (
        <Card className="mt-5">
          <div className="label">{t("setup.preview")}</div>
          <p className="mt-2 text-text italic caret">“{String(p.preview).replace(/[*#]/g, "")}”</p>
        </Card>
      )}
      <p className="mt-6 text-center text-sm text-muted">{t("setup.canStop")}</p>
    </Frame>
  );
}

/* ---------------- Screen 5: Result */
export function CapacityHero({ n, upTo, ttft }: { n: number; upTo: number; ttft: number }) {
  const { t } = useTranslation();
  const v = useCountUp(n);
  return (
    <div className="text-center">
      <div className="label">{t("setup.resultFor")}</div>
      <div className="mt-3 text-6xl font-bold tnum text-accent sm:text-7xl">{v}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{n === 1 ? t("setup.studentsOne").replace(/^1\s*/, "") : t("setup.students", { n: "" }).trim()}</div>
      <p className="mt-1 text-muted">{t("setup.canServe")}</p>
      <p className="mt-2 text-sm text-muted">{t("setup.capNote", { n: upTo, t: ttft })}</p>
    </div>
  );
}

function Result() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [r, setR] = useState<any>(null);
  useEffect(() => { api("/api/results").then(setR); }, []);
  if (!r) return <Frame step={3}><Card><Skeleton lines={6} /></Card></Frame>;
  if (r.empty) return <Navigate to="/setup/goal" replace />;
  const sel = r.data.selection || {}, cap = r.data.capacity || {}, rec = sel.recommended;
  const weak = rec?.weak_langs || [];
  return (
    <Frame step={3}>
      <Card className="py-8">
        {rec && cap.n > 0 ? <CapacityHero n={cap.n} upTo={cap.tested_up_to} ttft={cap.max_ttft} /> : <Notice tone="warn">{t("setup.noCapacity")}</Notice>}
        {r.data.hardware?.simulated && <div className="mt-3 text-center"><span className="badge bg-warn/15 text-warn">{t("app.simulated")}</span></div>}
      </Card>
      {rec && (
        <Card className="mt-4">
          <div className="label">{t("setup.recSetup")}</div>
          <div className="mt-1 text-xl font-bold text-ink">{rec.label}</div>
          <p className="mt-2 text-text"><span className="font-semibold">{t("setup.why")}: </span>{sel.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className="badge bg-sunken text-text tnum">{fmt.n1(rec.tps)} tok/s</span>
            <span className="badge bg-sunken text-text tnum">{fmt.n1(rec.ttft)} s first word</span>
            <span className="badge bg-sunken text-text tnum">{fmt.n1(rec.peak_mem_gb)} GB</span>
            {Object.entries(rec.quality || {}).map(([l, q]: any) => <span key={l} className="badge bg-sunken text-text tnum">{langName(l)} {fmt.n0(q.acc)}%</span>)}
          </div>
          <div className="mt-4 border-t border-line pt-3 text-sm text-muted">
            {sel.runner_up && <>{t("setup.runnerUp")}: <span className="text-text">{sel.runner_up.label}</span> · </>}
            {sel.fast ? <>{t("setup.fastModel")}: <span className="text-text">{sel.fast.label}</span></> : t(sel.fast_note === "already_fastest" ? "setup.alreadyFast" : "setup.noFast")}
            {" · "}<Link to="/admin/results" className="font-semibold text-accent">{t("setup.seeAll")} →</Link>
          </div>
        </Card>
      )}
      {weak.map((l: string) => <Notice key={l} tone="warn" className="mt-3">{t("setup.weakLang", { lang: langName(l) })}</Notice>)}
      <div className="mt-8 flex justify-between gap-3">
        <Button variant="secondary" onClick={() => nav("/setup/goal")}>{t("app.back")}</Button>
        {rec && <Button size="lg" icon={<ArrowRight size={18} />} onClick={() => { api("/api/setup/step", { body: { setup_step: "launch" } }); nav("/setup/launch"); }}>{t("setup.useThis")}</Button>}
      </div>
    </Frame>
  );
}

/* ---------------- Screen 6: Launch and share */
export function ShareCard({ share, teacherCode }: { share: any; teacherCode?: string | null }) {
  const { t } = useTranslation();
  return (
    <Card className="p-0 sm:p-0 overflow-hidden">
      <div className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-center">
        <QR text={share.url} size={184} className="border border-line shrink-0" />
        <div className="text-center sm:text-left">
          <p className="text-lg font-semibold text-ink">{t("setup.launchBody")}</p>
          <p className="mt-3 text-sm text-muted">{t("setup.scanOrType")}</p>
          <p className="mt-1 font-mono text-2xl font-bold tnum text-accent break-all">{share.url.replace("http://", "")}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Link to="/print/poster" target="_blank" className="btn-secondary"><Printer size={18} />{t("setup.printPoster")}</Link>
            <button className="btn-secondary" onClick={() => { navigator.clipboard?.writeText(share.url); toast(t("app.copied")); }}><Copy size={18} />{t("setup.copyLink")}</button>
          </div>
        </div>
      </div>
      {teacherCode && (
        <div className="border-t border-line bg-teacher-soft/60 px-6 py-4">
          <div className="label text-teacher">{t("setup.teacherCode")}</div>
          <p className="mt-1 text-text">{t("setup.teacherCodeBody", { code: teacherCode })}</p>
          <div className="mt-2 font-mono text-3xl font-bold tracking-[0.3em] text-teacher tnum">{teacherCode}</div>
        </div>
      )}
    </Card>
  );
}

function Launch() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [pin, setPin] = useState("");
  const [school, setSchool] = useState("");
  const [done, setDone] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [already, setAlready] = useState(false);
  useEffect(() => { api("/api/public").then((p) => { setSchool(p.school_name === "Your School Name" ? "" : p.school_name); setAlready(!!p.pin_set && !!p.setup_done); }); }, []);
  const applyOnly = async () => {
    setBusy(true); setErr("");
    try { await api("/api/apply", { body: {} }); setDone({ share: await api("/api/share"), teacher_code: null }); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const finish = async () => {
    setErr("");
    if (!/^\d{4,8}$/.test(pin)) { setErr(t("setup.choosePin")); return; }
    setBusy(true);
    try {
      const r = await api("/api/setup/finish", { body: { pin, school_name: school || undefined } });
      if (r.token) auth.set(r.token, "admin");
      setDone(r);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Frame step={4}>
      {!done && already ? (
        <Card>
          <h1 className="text-2xl font-bold">{t("setup.useThis")}</h1>
          <p className="mt-2 text-muted">InferSmart is already set up. This applies the new recommended setting; the admin PIN and teacher code stay the same.</p>
          {err && <Notice tone="danger" className="mt-4">{err}</Notice>}
          <Button size="lg" className="mt-6" loading={busy} icon={<Play size={18} />} onClick={applyOnly}>{busy ? t("setup.starting") : t("setup.useThis")}</Button>
        </Card>
      ) : !done ? (
        <Card>
          <h1 className="text-2xl font-bold">{t("setup.startInferSmart")}</h1>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-sm font-medium text-muted">{t("setup.choosePin")}</span>
              <input className="input font-mono tracking-[0.3em]" inputMode="numeric" type="password" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} />
              <span className="mt-1 block text-xs text-muted">{t("setup.pinHint")}</span></label>
            <label className="block"><span className="mb-1 block text-sm font-medium text-muted">{t("setup.schoolName")}</span>
              <input className="input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Government High School" /></label>
          </div>
          {err && <Notice tone="danger" className="mt-4">{err}</Notice>}
          <Button size="lg" className="mt-6 w-full sm:w-auto" loading={busy} icon={<Play size={18} />} onClick={finish}>{busy ? t("setup.starting") : t("setup.startInferSmart")}</Button>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ok/15 text-ok"><Check size={22} /></span>
            <div><h1 className="text-2xl font-bold">{t("setup.launchTitle")}</h1><RunningBadge /></div>
          </div>
          <ShareCard share={done.share} teacherCode={done.teacher_code} />
          <div className="mt-6 flex flex-wrap gap-3">
            <Button icon={<LayoutDashboard size={18} />} onClick={() => nav("/admin")}>{t("setup.openDashboard")}</Button>
            <Button variant="secondary" icon={<MessageSquare size={18} />} onClick={() => nav("/chat")}>{t("setup.tryChat")}</Button>
          </div>
        </>
      )}
    </Frame>
  );
}

export default function Setup() {
  return (
    <Routes>
      <Route index element={<Welcome />} />
      <Route path="passport" element={<Passport />} />
      <Route path="goal" element={<Goal />} />
      <Route path="test" element={<Testing />} />
      <Route path="result" element={<Result />} />
      <Route path="launch" element={<Launch />} />
      <Route path="*" element={<Navigate to="/setup" replace />} />
    </Routes>
  );
}
