import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LogIn, UserPlus } from "lucide-react";
import { api, studentAuth } from "../api";
import { Logo, Notice, Skeleton } from "./ui";

export type Student = { id: number; username: string; name: string };
type Ctx = { user: Student; logout: () => void };
const StudentCtx = createContext<Ctx | null>(null);
export const useStudent = () => useContext(StudentCtx)!;

/** Shows the log-in / create-account screen until a student is logged in. */
export function StudentGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Student | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!studentAuth.token()) { setChecking(false); return; }
    api<Student>("/api/users/me").then(setUser).catch(() => studentAuth.clear()).finally(() => setChecking(false));
  }, []);

  const logout = () => {
    api("/api/users/logout", { body: {} }).catch(() => {});
    studentAuth.clear();
    setUser(null);
  };

  if (checking) return <div className="mx-auto max-w-md p-8"><Logo /><div className="mt-8"><Skeleton lines={4} /></div></div>;
  if (!user) return <LoginScreen onDone={(u, tok) => { studentAuth.set(tok); setUser(u); }} />;
  return <StudentCtx.Provider value={{ user, logout }}>{children}</StudentCtx.Provider>;
}

function LoginScreen({ onDone }: { onDone: (u: Student, token: string) => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (mode === "signup" && pw !== pw2) { setErr(t("login.mismatch")); return; }
    setBusy(true);
    try {
      const r = await api<{ token: string; user: Student }>(mode === "login" ? "/api/users/login" : "/api/users/signup",
        { body: mode === "login" ? { username, password: pw } : { username, password: pw, name } });
      onDone(r.user, r.token);
    } catch (ex: any) {
      setErr(ex?.message === "offline" ? t("app.cantReach") : ex?.message || "Error");
    } finally { setBusy(false); }
  };

  const field = "input mt-1 w-full";
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo size={34} /></div>
        <div className="card p-6">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-ctl bg-sunken p-1" role="tablist">
            {(["login", "signup"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr(""); }}
                className={`min-h-[40px] rounded-ctl text-sm font-semibold transition-colors ${mode === m ? "bg-surface text-ink shadow-sm" : "text-muted"}`}>
                {m === "login" ? t("login.login") : t("login.signup")}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <label className="block text-sm font-medium text-muted">{t("login.name")}
                <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="nickname" />
              </label>
            )}
            <label className="block text-sm font-medium text-muted">{t("login.username")}
              <input className={field} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
                required minLength={3} maxLength={24} autoComplete="username" autoCapitalize="none" spellCheck={false} />
            </label>
            <label className="block text-sm font-medium text-muted">{t("login.password")}
              <input className={field} type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={4} maxLength={64}
                autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </label>
            {mode === "signup" && (
              <label className="block text-sm font-medium text-muted">{t("login.password2")}
                <input className={field} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={4} maxLength={64} autoComplete="new-password" />
              </label>
            )}
            {mode === "signup" && <p className="text-xs text-muted">{t("login.rules")}</p>}
            {err && <Notice tone="danger">{err}</Notice>}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {mode === "login" ? <LogIn size={18} /> : <UserPlus size={18} />}
              {mode === "login" ? t("login.login") : t("login.create")}
            </button>
          </form>
          {mode === "login" && <p className="mt-4 text-center text-xs text-muted">{t("login.forgot")}</p>}
        </div>
        <p className="mt-4 text-center text-xs text-muted">{t("login.privacy")}</p>
      </div>
    </div>
  );
}
