import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowUp, Copy, Flag, Lightbulb, LogOut, MessageSquare, MonitorPlay, MoreVertical, PanelLeft, Plus, Square, Trash2, Type, Moon, Sun, Contrast, WifiOff, RotateCcw, X } from "lucide-react";
import { api, deviceId, live, stream, type StreamEvent } from "../api";
import { deleteAllChats, deleteChat, getChat, groupByDay, listChats, newId, saveChat, type ConvMeta, type Msg } from "../chatStore";
import { StudentGate, useStudent } from "../components/StudentGate";
import { pickSuggestions } from "../suggestions";
import { Chip, cx, Logo, Markdown, Notice, toast, Dialog } from "../components/ui";
import { QLangToggle, VoiceButton } from "../components/VoiceButton";
import { DotField } from "../components/DotField";
import { langName } from "../i18n";
import { usePrefs } from "../prefs";


export function useChatEngine(opts: { kind?: "student" | "present" } = {}) {
  const { qLang: lang } = usePrefs();
  const [msgs, setMsgs] = useState<Msg[]>([]);  // every visit starts with a new, empty chat
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<{ position: number; eta_s: number } | null>(null);
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

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
  const clear = () => { abort.current?.abort(); setMsgs([]); };
  const retry = () => {
    let i = msgs.length - 1;
    while (i >= 0 && msgs[i].role !== "user") i--;
    if (i >= 0) ask(msgs[i].content, undefined, msgs.slice(0, i));
  };
  return { msgs, ask, retry, stop, clear, busy, queue, offline, notice, setMsgs };
}

export default function Chat() {
  return <StudentGate><ChatPage /></StudentGate>;
}

function ChatPage() {
  const { t } = useTranslation();
  const { user, logout } = useStudent();
  const { qLang: lang, theme, setTheme, size, setSize } = usePrefs();
  const c = useChatEngine();
  const [convId, setConvId] = useState(newId);
  const hello = useMemo(() => greeting(user.name), [convId, user.name]);  // a fresh friendly line for every new chat
  const [chats, setChats] = useState<ConvMeta[]>([]);
  const refresh = () => listChats().then(setChats).catch(() => {});
  useEffect(() => { refresh(); }, []);
  const [drawer, setDrawer] = useState(false);
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
  // Saved under this student's account on the school computer: when a message is added and when an answer finishes.
  const justOpened = useRef(false);  // opening an old chat must not move it to the top of the list
  useEffect(() => {
    if (justOpened.current) { justOpened.current = false; return; }
    if (c.msgs.length) saveChat(convId, c.msgs).then(refresh).catch(() => {});
  }, [convId, c.msgs.length, c.busy]);

  const leaveCurrent = async () => { if (c.msgs.length) await saveChat(convId, c.msgs).catch(() => {}); c.clear(); };  // keeps a half-written answer
  const newChat = async () => { await leaveCurrent(); refresh(); setConvId(newId()); setText(""); setDrawer(false); input.current?.focus(); };
  const openChat = async (id: string) => {
    if (id === convId && c.msgs.length) { setDrawer(false); return; }
    try {
      const conv = await getChat(id);
      await leaveCurrent(); justOpened.current = true;
      c.setMsgs(conv.msgs); setConvId(id); refresh(); setText(""); setDrawer(false);
    } catch { toast(t("app.cantReach")); }
  };
  const removeChat = async (id: string) => { await deleteChat(id).catch(() => {}); if (id === convId) { c.clear(); setConvId(newId()); } refresh(); };
  const doLogout = async () => { await leaveCurrent(); setMenu(false); logout(); };

  const send = (q?: string) => {
    const v = (q ?? text).trim();
    if (!v) return;
    setText("");
    c.ask(v);
    input.current?.focus();
  };
  const suggestions = useMemo(() => pickSuggestions(lang), [convId, lang]);  // a fresh, varied set for every new chat
  // The question box: big and centred on a new chat, at the bottom once the conversation starts.
  const composer = (big: boolean) => (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); c.busy ? c.stop() : send(); }}>
      <label htmlFor="q" className="sr-only">{t("chat.placeholder")}</label>
      <textarea id="q" ref={input} rows={big ? 2 : 1} value={text} lang={lang} disabled={info?.exam_mode} autoFocus={big}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={lang === "kn" ? t("chat.placeholderKn") : "How can I help you today?"}
        className={big ? "min-h-[64px] max-h-48" : "min-h-[44px] max-h-36"} />
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <QLangToggle />
        <div className="flex items-center gap-2">
          <VoiceButton lang={lang} disabled={c.busy || !!info?.exam_mode}
            onText={(v) => { setText((p) => (p.trim() ? p.trim() + " " : "") + v); input.current?.focus(); }} />
          {c.busy ? (
            <button type="submit" className="btn-secondary h-11 w-11 rounded-xl px-0" aria-label={t("chat.stop")}><Square size={17} /></button>
          ) : (
            <button type="submit" className="btn-primary h-11 w-11 rounded-xl px-0" aria-label={t("chat.send")} disabled={!text.trim()}><ArrowUp size={21} /></button>
          )}
        </div>
      </div>
    </form>
  );
  const last = c.msgs[c.msgs.length - 1];

  return (
    <div className="flex h-[100dvh] bg-bg">
      <aside className="hidden w-72 shrink-0 border-r border-line bg-surface lg:flex lg:flex-col no-print">
        <Sidebar chats={chats} current={c.msgs.length ? convId : null} onNew={newChat} onOpen={openChat} onDelete={removeChat} user={user.name} onLogout={doLogout} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-surface shadow-xl">
            <Sidebar chats={chats} current={c.msgs.length ? convId : null} onNew={newChat} onOpen={openChat} onDelete={removeChat} user={user.name} onLogout={doLogout} onClose={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="relative flex min-w-0 flex-1 flex-col">
      <DotField />
      <header className="relative z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1 min-w-0">
            <button className="btn-ghost min-h-[44px] px-2.5 lg:hidden" aria-label={t("chat.history")} onClick={() => setDrawer(true)}><PanelLeft size={20} /></button>
            <span className="lg:hidden"><Logo size={26} /></span>
            <button className="btn-ghost min-h-[44px] px-2.5 lg:hidden" aria-label={t("chat.newChat")} onClick={newChat}><Plus size={20} /></button>
          </div>
          <div className="flex items-center gap-1.5">
            <button className="btn-ghost min-h-[44px] px-2.5" aria-label="Menu" onClick={() => setMenu(true)}><MoreVertical size={20} /></button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4">
        {info?.exam_mode && <Notice tone="warn" className="mb-4">{t("chat.examOff")}</Notice>}
        {c.msgs.length === 0 && (
          <section className="rise flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center pb-10">
            <div className="flex items-center gap-3 text-center">
              <h1 className="font-display text-3xl font-normal text-ink sm:text-[2.6rem] sm:leading-tight">{hello}</h1>
            </div>
            <div className="mt-7 w-full max-w-2xl">{composer(true)}</div>
            <div className="mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
              {suggestions.map((s, i) => (
                <button key={i} className="chip-suggest" onClick={() => send(s.q)}>
                  <s.icon size={16} className="text-accent" aria-hidden="true" />{s.label}
                </button>
              ))}
            </div>
            <p className="mt-6 text-xs text-muted">{t("app.aiMistakes")}</p>
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
      </div></main>

      {c.msgs.length > 0 && (
        <footer className="relative z-20 bg-bg/90 backdrop-blur-sm no-print">
          <div className="mx-auto max-w-3xl px-4 pt-2 pb-[max(10px,env(safe-area-inset-bottom))]">
            {composer(false)}
            <p className="mt-1.5 text-center text-xs text-muted">{t("app.aiMistakes")}</p>
          </div>
        </footer>
      )}
      </div>

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
            <button className="btn-secondary justify-start" onClick={async () => { if (window.confirm(t("chat.deleteAllAsk"))) { await deleteAllChats().catch(() => {}); c.clear(); setConvId(newId()); refresh(); setMenu(false); toast(t("chat.cleared")); } }}><Trash2 size={18} />{t("chat.deleteAll")}</button>
            <button className="btn-secondary justify-start" onClick={doLogout}><LogOut size={18} />{t("login.logout")} ({user.username})</button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function Sidebar({ chats, current, onNew, onOpen, onDelete, onClose, user, onLogout }: {
  chats: ConvMeta[]; current: string | null; onNew: () => void; onOpen: (id: string) => void; onDelete: (id: string) => void; onClose?: () => void;
  user: string; onLogout: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <Logo size={26} />
        {onClose && <button className="btn-ghost min-h-[40px] px-2" aria-label={t("app.close")} onClick={onClose}><X size={20} /></button>}
      </div>
      <div className="px-3">
        <button className="btn-primary w-full justify-start" onClick={onNew}><Plus size={18} />{t("chat.newChat")}</button>
      </div>
      <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-3" aria-label={t("chat.history")}>
        {chats.length === 0 && <p className="px-2 text-sm text-muted">{t("chat.noChats")}</p>}
        {groupByDay(chats).map((g) => (
          <div key={g.label} className="mb-4">
            <div className="label px-2 pb-1.5">{t(`chat.${g.label}`)}</div>
            <ul className="space-y-0.5">
              {g.items.map((conv) => (
                <li key={conv.id} className="group relative">
                  <button onClick={() => onOpen(conv.id)} title={conv.title}
                    className={cx("flex min-h-[40px] w-full items-center gap-2 rounded-ctl py-2 pl-2.5 pr-9 text-left text-sm transition-colors",
                      conv.id === current ? "bg-accent-soft font-semibold text-ink" : "text-text hover:bg-sunken")}>
                    <MessageSquare size={15} className="shrink-0 text-muted" />
                    <span className="truncate">{conv.title}</span>
                  </button>
                  <button onClick={() => onDelete(conv.id)} aria-label={`${t("chat.deleteChat")}: ${conv.title}`} title={t("chat.deleteChat")}
                    className={cx("absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:bg-sunken hover:text-danger",
                      conv.id === current ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover:opacity-100")}>
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-line px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent">{user.slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{user}</span>
          <button className="btn-ghost min-h-[36px] px-2 text-sm" onClick={onLogout} title={t("login.logout")} aria-label={t("login.logout")}><LogOut size={16} /></button>
        </div>
        <p className="mt-2 text-xs text-muted">{t("chat.localOnly")}</p>
      </div>
    </>
  );
}

/* Friendly welcome with the student's name; a different one for every new chat. */
const GREETINGS = [
  (n: string) => `Hey ${n}, how's it going?`,
  (n: string) => `Hi ${n}! What's on your mind?`,
  (n: string) => `Welcome back, ${n}`,
  (n: string) => `Hello ${n}, ready to learn something new?`,
  (n: string) => `Good to see you, ${n}`,
  (n: string) => `${n}, how are things?`,
  (n: string) => `Hey ${n}, what shall we explore today?`,
  (n: string) => `Hi ${n}, let's figure it out together`,
];
function greeting(name: string): string {
  const first = (name || "").trim().split(/\s+/)[0] || "there";
  const nice = first.charAt(0).toUpperCase() + first.slice(1);
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)](nice);
}
