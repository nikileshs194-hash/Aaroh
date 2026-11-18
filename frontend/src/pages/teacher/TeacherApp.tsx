import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { BadgeCheck, BookOpen, CheckCircle2, Clock, FilePenLine, FolderOpen, Languages, Layers, Lightbulb, ListChecks, Loader2, Lock, NotebookPen, Pencil, Printer, Share2, Trash2, Type, Square, Library, Pause, Play, Sparkles } from "lucide-react";
import { api, auth, fmt, stream } from "../../api";
import { Button, Card, Chip, cx, Dialog, Empty, LangSwitcher, Logo, Markdown, Notice, PinPad, Progress, Select, Skeleton, toast, Toggle } from "../../components/ui";
import { langName } from "../../i18n";
import { usePrefs } from "../../prefs";

const ICONS: Record<string, ReactNode> = {
  lesson_plan: <NotebookPen size={26} />, quiz: <ListChecks size={26} />, worksheet: <FilePenLine size={26} />,
  explain: <Lightbulb size={26} />, translate: <Languages size={26} />,
};

function Gate({ onOk }: { onOk: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [name, setName] = useState(auth.teacherName());
  const [err, setErr] = useState("");
  const submit = async () => {
    setErr("");
    try {
      const r = await api("/api/login", { body: { role: "teacher", secret: code } });
      auth.set(r.token, "teacher");
      auth.setTeacherName(name.trim() || "Teacher");
      onOk();
    } catch (e: any) { setErr(e.message); setCode(""); }
  };
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg px-4">
      <Card className="rise w-full max-w-sm py-8 text-center">
        <Logo />
        <h1 className="mt-6 text-2xl font-bold">{t("teacher.gateTitle")}</h1>
        <p className="mt-1 text-muted">{t("teacher.gateBody")}</p>
        <label className="mt-6 block text-left"><span className="mb-1 block text-sm font-medium text-muted">{t("teacher.yourName")}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("teacher.namePh")} maxLength={40} /></label>
        <div className="mt-6"><PinPad value={code} onChange={setCode} onSubmit={submit} label={t("setup.teacherCode")} /></div>
        {err && <Notice tone="danger" className="mt-4 text-left">{err}</Notice>}
        <Link to="/chat" className="btn-ghost mt-4">{t("app.back")}</Link>
      </Card>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const tabs = [
    { to: "/teacher", end: true, icon: <Sparkles size={20} />, label: t("nav.create") },
    { to: "/teacher/plans", icon: <FolderOpen size={20} />, label: t("nav.myPlans") },
    { to: "/teacher/library", icon: <Library size={20} />, label: t("nav.library") },
    { to: "/teacher/queue", icon: <Layers size={20} />, label: t("nav.queue") },
  ];
  return (
    <div className="min-h-[100dvh] bg-bg pb-20 sm:pb-0">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <Logo size={26} withName={false} />
            <span className="font-semibold text-teacher">{t("nav.studio")}</span>
            <span className="hidden text-sm text-muted sm:inline">· {auth.teacherName()}</span>
          </div>
          <nav className="hidden items-center gap-1 sm:flex">
            {tabs.map((x) => <NavLink key={x.to} to={x.to} end={x.end} className={({ isActive }) => cx("btn min-h-[40px] px-3 text-sm", isActive ? "bg-teacher-soft text-teacher" : "text-muted hover:bg-sunken")}>{x.icon}{x.label}</NavLink>)}
          </nav>
          <button className="btn-ghost min-h-[40px] px-2.5 text-sm" onClick={() => { auth.clear(); nav("/chat"); }}><Lock size={16} />{t("nav.logout")}</button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface sm:hidden" aria-label="Teacher Studio">
        {tabs.map((x) => (
          <NavLink key={x.to} to={x.to} end={x.end} className={({ isActive }) => cx("flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-xs font-medium", isActive ? "text-teacher" : "text-muted")}>
            {x.icon}<span>{x.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Home() {
  const { t } = useTranslation();
  const [cat, setCat] = useState<any>(null);
  useEffect(() => { api("/api/templates").then(setCat); }, []);
  return (
    <div className="rise">
      <h1 className="text-2xl font-bold">{t("teacher.whatNeed")}</h1>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cat ? Object.keys(cat.templates).map((k) => (
          <Link key={k} to={`/teacher/new/${k}`} className="card group flex min-h-[132px] flex-col gap-2 p-4 transition-colors hover:border-teacher/50 hover:bg-teacher-soft/40">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-teacher-soft text-teacher">{ICONS[k]}</span>
            <span className="text-lg font-semibold text-ink">{t(`teacher.${k}`)}</span>
            <span className="text-sm text-muted">{t(`teacher.${k}_d`)}</span>
          </Link>
        )) : Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-32" />)}
      </div>
      <Notice className="mt-6">{t("teacher.noNames")}</Notice>
    </div>
  );
}

function Create() {
  const { tpl = "lesson_plan" } = useParams();
  const { t } = useTranslation();
  const { lang } = usePrefs();
  const nav = useNavigate();
  const [cat, setCat] = useState<any>(null);
  const [f, setF] = useState<Record<string, string>>({ class: "9", subject: "Science", chapter: "Life processes", duration: "40", count: "10", language: lang, topic: "Photosynthesis", text: "" });
  const [out, setOut] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [queue, setQueue] = useState<any>(null);
  const [batch, setBatch] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { api("/api/templates").then(setCat); }, []);
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const fields: string[] = cat?.templates?.[tpl]?.fields || [];
  const chapters: string[] = cat?.subjects?.[f.subject] || [];
  useEffect(() => { if (chapters.length && !chapters.includes(f.chapter)) setF((x) => ({ ...x, chapter: chapters[0], topic: chapters[0] })); }, [f.subject, cat]);

  const generate = async () => {
    setOut(""); setErr(""); setBusy(true); setQueue(null);
    abort.current = new AbortController();
    let acc = "", ttl = "";
    await stream("/api/studio/generate", { template: tpl, fields: f }, (e) => {
      if (e.type === "token") { acc += e.text; setOut(acc); setQueue(null); }
      else if (e.type === "meta") { ttl = e.title; setTitle(e.title); }
      else if (e.type === "queue") setQueue(e);
      else if (e.type === "blocked") setErr(e.text);
      else if (e.type === "error") setErr(e.code === "offline" ? t("app.offlineClient", { wifi: "school Wi-Fi" }) : e.message);
    }, abort.current.signal);
    setBusy(false);
    if (acc.trim()) {
      const item = await api("/api/library", { body: { template: tpl, fields: f, body: acc.trim(), title: ttl } });
      toast(t("teacher.saved"));
      nav(`/teacher/item/${item.id}`, { replace: false });
    }
  };
  const sel = (k: string, opts: string[], label: string, render = (o: string) => o) =>
    <Select id={k} label={label} value={f[k]} onChange={set(k)} options={opts.map((o) => ({ value: o, label: render(o) }))} />;

  if (!cat) return <Skeleton lines={6} />;
  return (
    <div className="rise">
      <Link to="/teacher" className="btn-ghost -ml-3 text-sm">← {t("app.back")}</Link>
      <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold"><span className="text-teacher">{ICONS[tpl]}</span>{t(`teacher.${tpl}`)}</h1>
      <Card className="mt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.includes("class") && sel("class", cat.classes, t("teacher.class"))}
          {fields.includes("subject") && sel("subject", Object.keys(cat.subjects), t("teacher.subject"))}
          {fields.includes("chapter") && sel("chapter", chapters, t("teacher.chapter"))}
          {fields.includes("topic") && sel("topic", chapters, t("teacher.topic"))}
          {fields.includes("duration") && sel("duration", cat.durations, t("teacher.duration"), (o) => t("teacher.minutes", { n: o }))}
          {fields.includes("count") && sel("count", cat.counts, t("teacher.count"))}
          {fields.includes("text") && (
            <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-medium text-muted">{t("teacher.text")}</span>
              <textarea className="input min-h-[120px] py-2" value={f.text} onChange={(e) => set("text")(e.target.value)} /></label>
          )}
        </div>
        {fields.includes("language") && (
          <div className="mt-4">
            <span className="mb-2 block text-sm font-medium text-muted">{t("teacher.language")}</span>
            <div className="flex flex-wrap gap-2">{["en", "kn", "hi"].map((l) => <Chip key={l} role="radio" selected={f.language === l} onClick={() => set("language")(l)}><span lang={l}>{langName(l)}</span></Chip>)}</div>
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {busy ? <Button variant="secondary" icon={<Square size={16} />} onClick={() => abort.current?.abort()}>{t("chat.stop")}</Button>
            : <Button variant="teacher" size="lg" icon={ICONS[tpl]} onClick={generate} disabled={tpl === "translate" && !f.text.trim()}>{t("teacher.create", { what: t(`teacher.${tpl}`) })}</Button>}
          {tpl === "lesson_plan" && !busy && <Button variant="secondary" icon={<Layers size={18} />} onClick={() => setBatch(true)}>{t("teacher.prepareChapter")}</Button>}
          <span className="text-sm text-muted">{t("teacher.noNames")}</span>
        </div>
      </Card>
      {queue && <Notice className="mt-4">{t("chat.busy", { s: queue.eta_s })}</Notice>}
      {err && <Notice tone="warn" className="mt-4">{err}</Notice>}
      {(busy || out) && (
        <Card className="mt-4">
          <div className="mb-2 flex items-center gap-2 text-sm text-teacher"><Loader2 size={16} className="animate-spin" />{t("teacher.writing")}</div>
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          <div lang={f.language}>{out ? <Markdown text={out} className="caret" /> : <Skeleton lines={5} />}</div>
        </Card>
      )}
      <BatchDialog open={batch} onClose={() => setBatch(false)} fields={f} />
    </div>
  );
}

function BatchDialog({ open, onClose, fields }: { open: boolean; onClose: () => void; fields: any }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [n, setN] = useState("4");
  const [quiz, setQuiz] = useState(true);
  return (
    <Dialog open={open} onClose={onClose} title={t("teacher.prepareChapter")}>
      <p className="text-muted">{fields.class && `Class ${fields.class} · `}{fields.subject} · {fields.chapter}</p>
      <div className="mt-4"><Select id="lessons" label={t("teacher.lessons")} value={n} onChange={setN} options={["2", "3", "4", "5", "6", "8"].map((x) => ({ value: x, label: x }))} /></div>
      <Toggle id="addquiz" checked={quiz} onChange={setQuiz} label={t("teacher.addQuiz")} />
      <Button variant="teacher" className="mt-3 w-full" icon={<Layers size={18} />} onClick={async () => {
        await api("/api/batch", { body: { fields, lessons: Number(n), quiz } });
        toast(t("teacher.queued")); onClose(); nav("/teacher/queue");
      }}>{t("teacher.prepareChapter")}</Button>
    </Dialog>
  );
}

function Item() {
  const { id } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [it, setIt] = useState<any>(null);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { api(`/api/library/${id}`).then((x) => { setIt(x); setDraft(x.body); }); }, [id]);
  const patch = async (b: any, msg?: string) => { const x = await api(`/api/library/${id}`, { method: "PATCH", body: b }); setIt(x); setDraft(x.body); if (msg) toast(msg); };
  const simpler = async () => {
    setBusy(true);
    let acc = "";
    await stream("/api/studio/revise", { text: it.body, kind: "simpler", language: it.language }, (e) => {
      if (e.type === "token") { acc += e.text; setDraft(acc); }
    });
    setBusy(false);
    if (acc.trim()) await patch({ body: acc.trim(), reviewed: false }, t("teacher.saved"));
  };
  if (!it) return <Skeleton lines={8} />;
  const indic = it.language === "kn" || it.language === "hi";
  const mine = it.author === auth.teacherName();
  return (
    <div className="rise">
      <Link to="/teacher/plans" className="btn-ghost -ml-3 text-sm no-print">← {t("nav.myPlans")}</Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{it.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {it.reviewed ? <span className="badge bg-ok/10 text-ok"><BadgeCheck size={13} />{t("teacher.reviewedBadge")}</span>
              : <span className="badge bg-warn/10 text-warn">{t("teacher.draft")}</span>}
            {it.shared && <span className="badge bg-teacher-soft text-teacher"><Share2 size={12} />{t("nav.library")}</span>}
            <span className="text-muted">{t("teacher.by", { name: it.author })} · {fmt.dateTime(it.updated)}</span>
          </div>
        </div>
      </div>
      {indic && !it.reviewed && <Notice tone="warn" className="mt-3">{t("teacher.checkKannada", { lang: langName(it.language) })}</Notice>}
      <Card className="mt-4">
        {edit ? <textarea lang={it.language} className="input min-h-[420px] py-3 font-sans leading-relaxed" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={t("teacher.edit")} />
          : <div lang={it.language}><Markdown text={busy ? draft : it.body} className={busy ? "caret" : ""} /></div>}
      </Card>
      <div className="no-print mt-4 flex flex-wrap gap-2">
        {edit ? <Button variant="teacher" icon={<CheckCircle2 size={18} />} onClick={async () => { await patch({ body: draft }, t("teacher.saved")); setEdit(false); }}>{t("teacher.doneEditing")}</Button>
          : <Button variant="secondary" icon={<Pencil size={18} />} onClick={() => setEdit(true)}>{t("teacher.edit")}</Button>}
        <Button variant="secondary" icon={<Type size={18} />} loading={busy} onClick={simpler} disabled={edit}>{t("teacher.simpler")}</Button>
        <a href={`/print/item/${id}`} target="_blank" className="btn-secondary"><Printer size={18} />{t("app.print")}</a>
        <Button variant={it.reviewed ? "secondary" : "teacher"} icon={<BadgeCheck size={18} />} onClick={() => patch({ reviewed: !it.reviewed })}>{it.reviewed ? t("teacher.unmarkReviewed") : t("teacher.markReviewed")}</Button>
        <Button variant="secondary" icon={<Share2 size={18} />} onClick={() => patch({ shared: !it.shared }, t("teacher.saved"))}>{it.shared ? t("teacher.unshare") : t("teacher.share")}</Button>
        {mine && <Button variant="ghost" className="text-danger" icon={<Trash2 size={18} />} onClick={() => setConfirm(true)}>{t("teacher.delete")}</Button>}
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t("teacher.delete")}>
        <p>{t("teacher.confirmDelete")}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(false)}>{t("app.cancel")}</Button>
          <Button variant="danger" onClick={async () => { await api(`/api/library/${id}`, { method: "DELETE" }); nav("/teacher/plans"); }}>{t("teacher.delete")}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function ItemList({ scope }: { scope: "mine" | "school" }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { setItems(null); api(`/api/library?scope=${scope}`).then(setItems); }, [scope]);
  return (
    <div className="rise">
      <h1 className="text-2xl font-bold">{scope === "mine" ? t("nav.myPlans") : t("nav.library")}</h1>
      <div className="mt-4 space-y-2.5">
        {items === null ? <Skeleton lines={5} /> : items.length === 0 ? (
          <Empty icon={<BookOpen size={30} />} title={scope === "mine" ? t("teacher.myPlansEmpty") : t("teacher.libraryEmpty")}
            action={<Link to="/teacher/new/lesson_plan" className="btn-teacher"><NotebookPen size={18} />{t("teacher.lesson_plan")}</Link>} />
        ) : items.map((it) => (
          <Link key={it.id} to={`/teacher/item/${it.id}`} className="card flex items-center gap-4 p-4 hover:bg-sunken">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teacher-soft text-teacher">{ICONS[it.template]}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-ink" lang={it.language}>{it.title}</div>
              <div className="text-sm text-muted">{langName(it.language)} · {fmt.dateTime(it.updated)}{scope === "school" && ` · ${t("teacher.by", { name: it.author })}`}</div>
            </div>
            {it.reviewed ? <span className="badge bg-ok/10 text-ok"><BadgeCheck size={13} /></span> : <span className="badge bg-warn/10 text-warn">{t("teacher.draft").split("·")[0]}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Queue() {
  const { t } = useTranslation();
  const [q, setQ] = useState<any>(null);
  const load = () => api("/api/batch").then(setQ).catch(() => {});
  useEffect(() => { load(); const id = setInterval(load, 3000); return () => clearInterval(id); }, []);
  const jobs: any[] = q?.jobs || [];
  const left = jobs.filter((j) => j.status === "queued" || j.status === "running").length;
  const done = jobs.filter((j) => j.status === "done").length;
  const eta = left * (q?.avg_answer_s ? Math.max(30, q.avg_answer_s * 4) : 60);
  return (
    <div className="rise">
      <h1 className="text-2xl font-bold">{t("teacher.queueTitle")}</h1>
      {q && (
        <Card className="mt-4">
          {left > 0 && <>
            <div className="flex items-center justify-between text-sm"><span>{done} / {done + left}</span><span className="text-muted"><Clock size={14} className="mr-1 inline" />{t("teacher.estFinish", { t: fmt.minutes(eta) })}</span></div>
            <Progress tone="teacher" value={(done / Math.max(1, done + left)) * 100} className="mt-2" />
            <p className="mt-2 text-sm text-muted">{q.paused ? t("teacher.pauseAll") : q.running ? `${t("teacher.queueRunning")}: ${q.running.label}` : q.waiting_for_quiet ? t("teacher.queueWaiting") : ""}</p>
          </>}
          <Toggle id="pwb" checked={true} onChange={(v) => api("/api/batch/pause", { body: { paused: q.paused, pause_when_busy: v } })} label={t("teacher.pauseWhenBusy")} />
          <Button variant="secondary" icon={q.paused ? <Play size={16} /> : <Pause size={16} />} onClick={() => api("/api/batch/pause", { body: { paused: !q.paused } }).then(load)}>{q.paused ? t("teacher.resumeAll") : t("teacher.pauseAll")}</Button>
        </Card>
      )}
      <div className="mt-4 space-y-2">
        {!q ? <Skeleton lines={4} /> : jobs.length === 0 ? <Empty icon={<Layers size={30} />} title={t("teacher.queueEmpty")} /> : jobs.map((j) => (
          <div key={j.id} className="card flex items-center gap-3 p-3.5">
            <span className={cx("badge", j.status === "done" ? "bg-ok/10 text-ok" : j.status === "running" ? "bg-teacher-soft text-teacher" : "bg-sunken text-muted")}>
              {j.status === "running" && <Loader2 size={12} className="animate-spin" />}{t(`teacher.st_${j.status}`)}
            </span>
            <span className="flex-1 truncate">{j.label}</span>
            {j.item_id ? <Link className="btn-ghost min-h-[36px] text-sm" to={`/teacher/item/${j.item_id}`}>{t("teacher.reuse")}</Link>
              : j.status === "queued" && <button className="btn-ghost min-h-[36px] px-2" aria-label={t("teacher.delete")} onClick={() => api(`/api/batch/${j.id}`, { method: "DELETE" }).then(load)}><Trash2 size={16} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TeacherApp() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    const r = auth.role();
    if (r === "teacher" || r === "admin") { setOk(true); return; }
    api("/api/public").then((p) => setOk(!p.pin_set && p.is_server)).catch(() => setOk(false));
    const h = () => { auth.clear(); setOk(false); };
    window.addEventListener("is-auth-required", h);
    return () => window.removeEventListener("is-auth-required", h);
  }, []);
  if (ok === null) return null;
  if (!ok) return <Gate onOk={() => setOk(true)} />;
  return (
    <Shell>
      <Routes>
        <Route index element={<Home />} />
        <Route path="new/:tpl" element={<Create />} />
        <Route path="item/:id" element={<Item />} />
        <Route path="plans" element={<ItemList scope="mine" />} />
        <Route path="library" element={<ItemList scope="school" />} />
        <Route path="queue" element={<Queue />} />
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Routes>
    </Shell>
  );
}
