import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowUp, Copy, Flag, Lightbulb, MonitorPlay, MoreVertical, Sparkles, Square, Trash2, Type, Moon, Sun, Contrast, WifiOff, Hourglass, RotateCcw } from "lucide-react";
import { api, deviceId, live, safeGet, safeSet, stream, type StreamEvent } from "../api";
import { Chip, cx, LangSwitcher, Logo, Markdown, Notice, RunningBadge, toast, Dialog } from "../components/ui";
import { langName } from "../i18n";
import { usePrefs } from "../prefs";

type Msg = { role: "user" | "assistant"; content: string; lang?: string; blocked?: boolean; stats?: { ttft: number; tps: number }; error?: boolean };
const KEY = "is_chat";
const ls = typeof localStorage !== "undefined" ? localStorage : undefined;
const loadMsgs = (): Msg[] => { try { return JSON.parse(safeGet(ls, KEY) || "[]"); } catch { return []; } };

export function useChatEngine(opts: { kind?: "student" | "present" } = {}) {
  const { lang } = usePrefs();
  const [msgs, setMsgs] = useState<Msg[]>(opts.kind === "present" ? [] : loadMsgs());
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<{ position: number; eta_s: number } | null>(null);
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { if (opts.kind !== "present") safeSet(ls, KEY, JSON.stringify(msgs.slice(-40))); }, [msgs]);

  async function ask(text: string, followup?: "simpler" | "example", base?: Msg[]) {
    if (busy) return;
    const history = [...(base ?? msgs), ...(followup ? [] : [{ role: "user" as const, content: text }])];
    setMsgs([...history, { role: "assistant", content: "", lang }]);
    setBusy(true); setQueue(null); setOffline(false); setNotice(null);
    abort.current = new AbortController();
    let acc = "";
    const update = (patch: Partial<Msg>) => setMsgs((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], ...patch }; return c; });
    await stream("/api/chat", {
      messages: history.filter((m) => !m.blocked && !m.error).map(({ role, content }) => ({ role, content })),
      language: lang, device_id: deviceId(), followup,
    }, (e: StreamEvent) => {
      if (e.type === "token") { acc += e.text; setQueue(null); update({ content: acc }); }
      else if (e.type === "queue") setQueue({ position: e.position, eta_s: e.eta_s });
      else if (e.type === "start") setQueue(null);
      else if (e.type === "blocked") update({ content: e.text, blocked: true });
      else if (e.type === "notice") setNotice(e.text);
      else if (e.type === "done") update({ stats: { ttft: e.ttft, tps: e.tps } });
      else if (e.type === "error") {
        if (e.code === "offline") { setOffline(true); update({ content: "", error: true }); }
        else update({ content: e.message, error: true });
      }
    }, abort.current.signal);
    setBusy(false); setQueue(null);
  }
  const stop = () => abort.current?.abort();
  const clear = () => { setMsgs([]); safeSet(ls, KEY, null); };
  const retry = () => {
    let i = msgs.length - 1;
    while (i >= 0 && msgs[i].role !== "user") i--;
    if (i >= 0) ask(msgs[i].content, undefined, msgs.slice(0, i));
  };
  return { msgs, ask, retry, stop, clear, busy, queue, offline, notice, setMsgs };
}

export default function Chat() {
  const { t } = useTranslation();
  const { lang, theme, setTheme, size, setSize } = usePrefs();
  const c = useChatEngine();
  const [text, setText] = useState("");
  const [info, setInfo] = useState<any>(null);
  const [mode, setMode] = useState("quality");
  const [menu, setMenu] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api("/api/public").then((p) => { setInfo(p); setMode(p.mode); }).catch(() => {});
    return live((topic, data) => { if (topic === "mode") setMode(data.mode); });
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [c.msgs, c.queue]);

  const send = (q?: string) => {
    const v = (q ?? text).trim();
    if (!v) return;
    setText("");
    c.ask(v);
    input.current?.focus();
  };
  const suggestions = [t("chat.s1"), t("chat.s2"), t("chat.s3"), t("chat.s4")];
  const last = c.msgs[c.msgs.length - 1];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Logo size={26} />
          </div>
          <div className="flex items-center gap-1.5">
            {mode !== "quality" && <span className="badge bg-warn/10 text-warn inline-flex"><Hourglass size={12} />{t("chat.fastMode")}</span>}
            <RunningBadge className="hidden sm:inline-flex" />
            <button className="btn-ghost min-h-[44px] px-2.5" aria-label="Menu" onClick={() => setMenu(true)}><MoreVertical size={20} /></button>
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-2.5"><LangSwitcher compact /></div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-40 pt-4">
        {info?.exam_mode && <Notice tone="warn" className="mb-4">{t("chat.examOff")}</Notice>}
        {c.msgs.length === 0 && (
          <section className="rise pt-6">
            <h1 className="text-2xl font-bold sm:text-3xl">{t("chat.title")}</h1>
            <p className="mt-1 text-muted">{t("chat.privateNote")}</p>
            <h2 className="label mt-8 mb-3">{t("chat.suggestions")}</h2>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => send(s)} className="card flex items-start gap-3 p-4 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft/40 min-h-[64px]">
                  <Sparkles size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  <span>{s}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <ol className="space-y-4" aria-live="polite">
          {c.msgs.map((m, i) => (
            <li key={i} className={cx("rise flex", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "user" ? (
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-on-accent whitespace-pre-wrap">{m.content}</div>
              ) : (
                <div className="w-full max-w-[95%]">
                  {(m.lang === "kn" || m.lang === "hi") && !m.blocked && m.content && (
                    <div className="mb-1.5"><span className="badge bg-warn/10 text-warn">{t("chat.checkLabel", { lang: langName(m.lang) })}</span></div>
                  )}
                  <div lang={m.lang} className={cx("card px-4 py-3", m.blocked && "border-warn/40 bg-warn/5", m.error && "border-danger/40")}>
                    {m.content ? <Markdown text={m.content} className={cx(c.busy && i === c.msgs.length - 1 && "caret")} />
                      : c.busy && i === c.msgs.length - 1 ? <span className="caret text-muted" aria-label={t("app.loading")} />
                      : m.error ? <span className="text-danger">{t("app.cantReach")}</span> : null}
                  </div>
                  {m.error && !c.busy && i === c.msgs.length - 1 && (
                    <button className="btn-ghost mt-1.5 min-h-[40px] px-2.5 text-sm" onClick={() => c.retry()}><RotateCcw size={15} />{t("app.tryAgain")}</button>
                  )}
                  {!c.busy || i < c.msgs.length - 1 ? (
                    m.content && !m.blocked && !m.error && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {i === c.msgs.length - 1 && <>
                          <button className="btn-ghost min-h-[40px] px-2.5 text-sm" onClick={() => c.ask("", "simpler")}><Type size={15} />{t("chat.simpler")}</button>
                          <button className="btn-ghost min-h-[40px] px-2.5 text-sm" onClick={() => c.ask("", "example")}><Lightbulb size={15} />{t("chat.example")}</button>
                        </>}
                        <button className="btn-ghost min-h-[40px] px-2.5 text-sm" onClick={() => { navigator.clipboard?.writeText(m.content); toast(t("app.copied")); }}><Copy size={15} />{t("chat.copy")}</button>
                        <button className="btn-ghost min-h-[40px] px-2.5 text-sm text-muted" onClick={() => { api("/api/report", { body: { category: "unsuitable", language: m.lang } }); toast(t("chat.reported")); }}><Flag size={15} />{t("chat.report")}</button>
                      </div>
                    )
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ol>
        {c.queue && (
          <div className="mt-4 rise"><Notice tone="info">
            <div className="font-medium">{t("chat.busy", { s: c.queue.eta_s })}</div>
            <div className="text-muted">{t("chat.position", { n: c.queue.position })}</div>
          </Notice></div>
        )}
        {c.offline && <div className="mt-4"><Notice tone="danger"><span className="inline-flex items-center gap-2"><WifiOff size={16} />{t("app.offlineClient", { wifi: info?.wifi_name || "school Wi-Fi" })}</span></Notice></div>}
        {c.notice && <div className="mt-4"><Notice tone="warn">{c.notice}</Notice></div>}
        <div ref={end} />
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur no-print">
        <div className="mx-auto max-w-3xl px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); c.busy ? c.stop() : send(); }}>
            <label htmlFor="q" className="sr-only">{t("chat.placeholder")}</label>
            <textarea id="q" ref={input} rows={1} value={text} lang={lang} disabled={info?.exam_mode}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={t("chat.placeholder")}
              className="input max-h-36 min-h-[48px] flex-1 resize-none py-3" />
            {c.busy ? (
              <button type="submit" className="btn-secondary h-12 w-12 px-0" aria-label={t("chat.stop")}><Square size={18} /></button>
            ) : (
              <button type="submit" className="btn-primary h-12 w-12 px-0" aria-label={t("chat.send")} disabled={!text.trim()}><ArrowUp size={22} /></button>
            )}
          </form>
          <p className="mt-2 text-center text-xs text-muted">{t("app.aiMistakes")}</p>
        </div>
      </footer>

      <Dialog open={menu} onClose={() => setMenu(false)} title={t("app.theme")}>
        <div className="space-y-5">
          <div>
            <div className="label mb-2">{t("app.theme")}</div>
            <div className="flex flex-wrap gap-2">
              <Chip selected={theme === "light"} onClick={() => setTheme("light")}><Sun size={15} />{t("app.light")}</Chip>
              <Chip selected={theme === "dark"} onClick={() => setTheme("dark")}><Moon size={15} />{t("app.dark")}</Chip>
              <Chip selected={theme === "contrast"} onClick={() => setTheme("contrast")}><Contrast size={15} />{t("app.contrast")}</Chip>
            </div>
          </div>
          <div>
            <div className="label mb-2">{t("app.textSize")}</div>
            <div className="flex gap-2">{[100, 125, 150].map((s) => <Chip key={s} selected={size === s} onClick={() => setSize(s)}>{s}%</Chip>)}</div>
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <Link to="/present" className="btn-secondary justify-start"><MonitorPlay size={18} />{t("chat.present")}</Link>
            <button className="btn-secondary justify-start" onClick={() => { c.clear(); setMenu(false); toast(t("chat.cleared")); }}><Trash2 size={18} />{t("chat.clear")}</button>
            <div className="flex gap-2 pt-1 text-sm">
              <Link to="/admin" className="btn-ghost flex-1">{t("nav.admin")}</Link>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
