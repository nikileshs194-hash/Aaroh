import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { BarChart3, FileText, Gauge, Lock, MessageSquare, QrCode, Settings, ShieldCheck, Users } from "lucide-react";
import { api, auth } from "../../api";
import { Card, cx, Logo, Notice, PinPad, RunningBadge, Skeleton } from "../../components/ui";
import { useAdminTheme } from "../../prefs";

const Dashboard = lazy(() => import("./Dashboard"));
const Results = lazy(() => import("./Results"));
const P = () => import("./Pages");
const Privacy = lazy(() => P().then((m) => ({ default: m.Privacy })));
const Summary = lazy(() => P().then((m) => ({ default: m.Summary })));
const SettingsPage = lazy(() => P().then((m) => ({ default: m.SettingsPage })));
const Share = lazy(() => P().then((m) => ({ default: m.Share })));
const Students = lazy(() => P().then((m) => ({ default: m.Students })));

function Gate({ onOk }: { onOk: () => void }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const submit = async () => {
    setErr("");
    try { const r = await api("/api/login", { body: { role: "admin", secret: pin } }); auth.set(r.token, "admin"); onOk(); }
    catch (e: any) { setErr(e.message); setPin(""); }
  };
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg px-4">
      <Card className="rise w-full max-w-sm py-8 text-center">
        <Logo />
        <h1 className="mt-6 text-2xl font-bold">{t("admin.gateTitle")}</h1>
        <p className="mt-1 text-muted">{t("admin.gateBody")}</p>
        <div className="mt-6"><PinPad value={pin} onChange={setPin} onSubmit={submit} label="PIN" /></div>
        {err && <Notice tone="danger" className="mt-4 text-left">{err}</Notice>}
        <Link to="/chat" className="btn-ghost mt-4">{t("app.back")}</Link>
      </Card>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  useAdminTheme();
  const items = [
    { to: "/admin", end: true, icon: <Gauge size={19} />, label: t("nav.dashboard"), phone: true },
    { to: "/admin/results", icon: <BarChart3 size={19} />, label: t("nav.results"), phone: true },
    { to: "/admin/privacy", icon: <ShieldCheck size={19} />, label: t("nav.privacy"), phone: true },
    { to: "/admin/summary", icon: <FileText size={19} />, label: t("nav.summary") },
    { to: "/admin/students", icon: <Users size={19} />, label: t("nav.students"), phone: true },
    { to: "/admin/share", icon: <QrCode size={19} />, label: t("nav.share") },
    { to: "/admin/settings", icon: <Settings size={19} />, label: t("nav.settings"), phone: true },
  ];
  return (
    <div className="min-h-[100dvh] bg-bg lg:flex">
      <aside className="no-print hidden w-60 shrink-0 border-r border-line bg-surface lg:flex lg:flex-col">
        <div className="px-5 py-4"><Logo /></div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Admin">
          {items.map((x) => (
            <NavLink key={x.to} to={x.to} end={x.end} className={({ isActive }) => cx("flex min-h-[44px] items-center gap-3 rounded-ctl px-3 text-[15px] font-medium transition-colors",
              isActive ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken hover:text-text")}>{x.icon}{x.label}</NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t border-line p-3">
          <Link to="/chat" className="flex min-h-[44px] items-center gap-3 rounded-ctl px-3 text-muted hover:bg-sunken"><MessageSquare size={19} />{t("nav.chat")}</Link>
          <button onClick={() => { auth.clear(); nav("/chat"); }} className="flex min-h-[44px] w-full items-center gap-3 rounded-ctl px-3 text-muted hover:bg-sunken"><Lock size={19} />{t("nav.logout")}</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1 pb-20 lg:pb-0">
        <header className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <Logo size={24} />
          <div className="flex items-center gap-2">
            <RunningBadge />
            <Link to="/admin/summary" className="btn-ghost min-h-[40px] px-2" aria-label={t("nav.summary")}><FileText size={19} /></Link>
            <Link to="/admin/share" className="btn-ghost min-h-[40px] px-2" aria-label={t("nav.share")}><QrCode size={19} /></Link>
            <button className="btn-ghost min-h-[40px] px-2" aria-label={t("nav.logout")} onClick={() => { auth.clear(); nav("/chat"); }}><Lock size={19} /></button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:py-8">{children}</main>
      </div>
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface lg:hidden" aria-label="Admin">
        {items.filter((x) => x.phone).map((x) => (
          <NavLink key={x.to} to={x.to} end={x.end} className={({ isActive }) => cx("flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-xs font-medium", isActive ? "text-accent" : "text-muted")}>
            {x.icon}<span>{x.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function AdminApp() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (auth.role() === "admin") setOk(true);
    else api("/api/public").then((p) => setOk(!p.pin_set && p.is_server)).catch(() => setOk(false));
    const h = () => { auth.clear(); setOk(false); };
    window.addEventListener("is-auth-required", h);
    return () => window.removeEventListener("is-auth-required", h);
  }, []);
  if (ok === null) return null;
  if (!ok) return <Gate onOk={() => setOk(true)} />;
  return (
    <Shell>
      <Suspense fallback={<Skeleton lines={8} />}>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="results" element={<Results />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="summary" element={<Summary />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="share" element={<Share />} />
          <Route path="students" element={<Students />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
