import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowUp, X, MessageSquarePlus } from "lucide-react";
import { useChatEngine } from "./Chat";
import { Logo, Markdown } from "../components/ui";
import { QLangToggle } from "../components/VoiceButton";

/** Projector mode: very large type on a dark background; question box hidden until the teacher taps. */
export default function Present() {
  const { t } = useTranslation();
  const c = useChatEngine({ kind: "present" });
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "dark";
    return () => { document.documentElement.dataset.theme = prev; };
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [c.msgs]);
  const pair = c.msgs.slice(-2);

  return (
    <div className="min-h-[100dvh] bg-bg px-6 py-6 sm:px-12">
      <div className="flex items-center justify-between">
        <Logo size={34} />
        <div className="flex items-center gap-3">
          <QLangToggle />
          <Link to="/chat" className="btn-ghost" aria-label={t("app.close")}><X size={26} /></Link>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-5xl">
        {pair.map((m, i) => m.role === "user"
          ? <h1 key={i} className="text-3xl sm:text-5xl font-bold leading-tight text-accent">{m.content}</h1>
          : <div key={i} lang={m.lang} className="mt-8 text-2xl sm:text-4xl leading-relaxed text-text">
              <Markdown text={m.content || " "} className={c.busy ? "caret" : ""} />
            </div>)}
        {c.queue && <p className="mt-6 text-2xl text-muted">{t("chat.busy", { s: c.queue.eta_s })}</p>}
        <div ref={end} />
      </div>
      <div className="fixed inset-x-0 bottom-6 flex justify-center px-6">
        {asking ? (
          <form className="flex w-full max-w-4xl gap-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { c.ask(text.trim()); setText(""); setAsking(false); } }}>
            <input autoFocus className="input h-16 flex-1 text-2xl" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("chat.placeholder")} aria-label={t("chat.placeholder")} />
            <button className="btn-primary h-16 w-16" aria-label={t("chat.send")}><ArrowUp size={28} /></button>
          </form>
        ) : (
          <button className="btn-secondary h-14 px-6 text-lg" onClick={() => setAsking(true)}><MessageSquarePlus size={22} />{t("chat.tapToAsk")}</button>
        )}
      </div>
      <p className="fixed bottom-1 left-0 right-0 text-center text-sm text-muted">{t("app.aiMistakes")}</p>
    </div>
  );
}
