import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, CheckCircle2, Cpu, Info, Loader2, ShieldCheck, X, XCircle, Delete } from "lucide-react";
import { LANGS } from "../i18n";
import { usePrefs } from "../prefs";

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(" "); }

/* ---------- Brand mark: a rounded chip outline with a dot ("intelligence inside the box you already have") */
export function Logo({ size = 28, withName = true, className = "" }: { size?: number; withName?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="text-accent shrink-0">
        <rect x="5" y="5" width="22" height="22" rx="7" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="16" cy="16" r="3.6" fill="currentColor" />
        <path d="M11 1.5v3M16 1.5v3M21 1.5v3M11 27.5v3M16 27.5v3M21 27.5v3M1.5 11h3M1.5 16h3M1.5 21h3M27.5 11h3M27.5 16h3M27.5 21h3"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {withName && <span className="font-bold tracking-tight text-ink" style={{ fontSize: size * 0.68 }}>Aa<span className="text-accent">roh</span></span>}
    </span>
  );
}

export function RunningBadge({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cx("badge bg-accent-soft text-accent border border-accent/20", className)}>
      <Cpu size={13} aria-hidden="true" /> {t("app.running")}
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "teacher"; loading?: boolean; icon?: ReactNode; size?: "md" | "lg";
};
export function Button({ variant = "primary", loading, icon, size = "md", className, children, disabled, ...rest }: BtnProps) {
  return (
    <button {...rest} disabled={disabled || loading}
      className={cx(`btn-${variant}`, size === "lg" && "min-h-[52px] px-6 text-base", className)}>
      {loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function Card({ children, className = "", as: As = "div", ...rest }: { children: ReactNode; className?: string; as?: any; [k: string]: any }) {
  return <As className={cx("card p-4 sm:p-5", className)} {...rest}>{children}</As>;
}

export function Chip({ selected, onClick, children, role = "button", className }: { selected?: boolean; onClick?: () => void; children: ReactNode; role?: string; className?: string }) {
  return (
    <button type="button" className={cx("chip", className)} onClick={onClick}
      {...(role === "radio" ? { role: "radio", "aria-checked": !!selected } : { "aria-pressed": !!selected })}>
      {selected && <Check size={15} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Stat({ label, value, unit, hint, tone, big }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: "ok" | "warn" | "danger"; big?: boolean }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className={cx("mt-1 font-bold tnum leading-none", big ? "text-5xl" : "text-3xl",
        tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-ink")}>
        {value}{unit && <span className="ml-1 text-base font-semibold text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-2 text-sm text-muted">{hint}</div>}
    </div>
  );
}

export function Progress({ value, className = "", tone = "accent" }: { value: number; className?: string; tone?: "accent" | "teacher" }) {
  return (
    <div className={cx("h-2.5 w-full rounded-full bg-sunken overflow-hidden", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <div className={cx("h-full rounded-full transition-[width] duration-500 ease-out", tone === "teacher" ? "bg-teacher" : "bg-accent")} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Ring({ value, size = 96, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(var(--sunken))" strokeWidth="8" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(var(--accent))" strokeWidth="8" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ transition: "stroke-dashoffset 500ms cubic-bezier(.16,1,.3,1)" }} />
      </svg>
      <span className="absolute text-xl font-bold tnum text-ink">{label ?? `${Math.round(value)}%`}</span>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; id: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <label htmlFor={id} className="cursor-pointer">
        <div className="font-medium text-text">{label}</div>
        {hint && <div className="text-sm text-muted">{hint}</div>}
      </label>
      <button id={id} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors duration-200", checked ? "bg-accent" : "bg-line")}>
        <span aria-hidden="true" className={cx("absolute left-0 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

export function Select({ label, value, onChange, options, id }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; id: string }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      <select id={id} className="input appearance-none bg-[length:16px] pr-8" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23667085' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Notice({ tone = "info", children, className = "" }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode; className?: string }) {
  const Icon = tone === "warn" ? AlertTriangle : tone === "danger" ? XCircle : tone === "ok" ? CheckCircle2 : Info;
  const color = tone === "warn" ? "text-warn border-warn/30 bg-warn/5" : tone === "danger" ? "text-danger border-danger/30 bg-danger/5"
    : tone === "ok" ? "text-ok border-ok/30 bg-ok/5" : "text-accent border-accent/25 bg-accent-soft";
  return (
    <div className={cx("flex gap-2.5 rounded-ctl border px-3.5 py-2.5 text-sm", color, className)} role={tone === "danger" ? "alert" : "status"}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="text-text">{children}</div>
    </div>
  );
}

export function Empty({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-line px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div>
      <p className="max-w-xs text-muted">{title}</p>
      {action}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div className="space-y-2.5" aria-busy="true">{Array.from({ length: lines }).map((_, i) => <div key={i} className="skeleton h-4" style={{ width: `${90 - i * 12}%` }} />)}</div>;
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className="rise w-full sm:max-w-lg rounded-t-2xl sm:rounded-card bg-surface p-5 shadow-float outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost min-h-[40px] px-2" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

let toastSet: ((t: { text: string; tone?: string } | null) => void) | null = null;
export function toast(text: string, tone: "ok" | "info" | "warn" = "ok") { toastSet?.({ text, tone }); }
export function Toaster() {
  const [t, setT] = useState<{ text: string; tone?: string } | null>(null);
  useEffect(() => { toastSet = setT; return () => { toastSet = null; }; }, []);
  useEffect(() => { if (t) { const id = setTimeout(() => setT(null), 3200); return () => clearTimeout(id); } }, [t]);
  if (!t) return null;
  return (
    <div className="no-print fixed bottom-20 sm:bottom-6 left-1/2 z-50 -translate-x-1/2 rise" role="status" aria-live="polite">
      <div className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-bg shadow-float">
        {t.tone === "warn" ? <AlertTriangle size={16} /> : <Check size={16} />} {t.text}
      </div>
    </div>
  );
}

export function LangSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = usePrefs();
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t("app.language")} className="flex flex-wrap gap-2">
      {LANGS.map((l) => (
        <Chip key={l.code} role="radio" selected={lang === l.code} onClick={() => setLang(l.code)}>
          <span lang={l.code}>{compact ? l.native : l.native}</span>
        </Chip>
      ))}
    </div>
  );
}

export function PinPad({ value, onChange, onSubmit, length = 4, label }: { value: string; onChange: (v: string) => void; onSubmit: () => void; length?: number; label: string }) {
  const press = (d: string) => value.length < 8 && onChange(value + d);
  // Laptop keyboards: number keys, Backspace and Enter work anywhere on the page (except text fields).
  const latest = useRef({ value, onChange, onSubmit });
  latest.current = { value, onChange, onSubmit };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" && !(e.target as HTMLElement).dataset.pin || tag === "TEXTAREA" || tag === "SELECT") return;
      const { value: v, onChange: ch, onSubmit: sub } = latest.current;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); if (v.length < 8) ch(v + e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); ch(v.slice(0, -1)); }
      else if (e.key === "Enter") { e.preventDefault(); sub(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div className="mb-4 flex justify-center gap-3" aria-label={label} aria-live="polite">
        {Array.from({ length: Math.max(length, value.length) }).map((_, i) => (
          <span key={i} className={cx("h-4 w-4 rounded-full border-2", i < value.length ? "bg-accent border-accent" : "border-line")} />
        ))}
      </div>
      <input className="sr-only" aria-label={label} inputMode="numeric" data-pin="1" value={value} readOnly />
      <div className="grid grid-cols-3 gap-2.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className="btn-secondary h-14 text-xl tnum" onClick={() => press(d)}>{d}</button>
        ))}
        <button type="button" className="btn-ghost h-14" aria-label="Delete" onClick={() => onChange(value.slice(0, -1))}><Delete size={22} /></button>
        <button type="button" className="btn-secondary h-14 text-xl tnum" onClick={() => press("0")}>0</button>
        <button type="button" className="btn-primary h-14" aria-label="Enter" onClick={onSubmit}><Check size={24} /></button>
      </div>
    </div>
  );
}

export function Stepper({ step }: { step: number }) {
  const { t } = useTranslation();
  const names = [t("setup.stepCheck"), t("setup.stepGoal"), t("setup.stepTest"), t("setup.stepLaunch")];
  return (
    <ol className="flex items-center gap-1 sm:gap-2" aria-label={t("setup.step", { n: step })}>
      {names.map((n, i) => {
        const s = i + 1, done = s < step, cur = s === step;
        return (
          <li key={n} className="flex flex-1 items-center gap-1.5 sm:gap-2" aria-current={cur ? "step" : undefined}>
            <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              done ? "bg-accent text-on-accent" : cur ? "border-2 border-accent text-accent" : "border border-line text-muted")}>
              {done ? <Check size={14} /> : s}
            </span>
            <span className={cx("hidden text-sm sm:inline", cur ? "font-semibold text-ink" : "text-muted")}>{n}</span>
            {s < 4 && <span className={cx("h-px flex-1", done ? "bg-accent" : "bg-line")} />}
          </li>
        );
      })}
    </ol>
  );
}

export function PrivacyPill() {
  return <span className="badge bg-ok/10 text-ok"><ShieldCheck size={13} aria-hidden="true" /> 0</span>;
}

/* ---------- Model answers: Markdown + maths (KaTeX), no raw HTML */
export { Markdown } from "./Markdown";

export function useCountUp(target: number | null | undefined, ms = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target == null) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}
