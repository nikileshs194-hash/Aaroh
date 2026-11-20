import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages, Loader2, Mic, Square } from "lucide-react";
import { usePrefs } from "../prefs";
import { cx, toast } from "./ui";

/** Voice input: records on this device, sends 16 kHz WAV to the school computer, gets text back.
 *  Speech is converted offline on the school computer (English: Parakeet, Kannada: IndicConformer); nothing is stored. */
const TARGET = 16000;
const MAX_S = 30;

function toWav(chunks: Float32Array[], rate: number): Blob {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(len);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  // downsample by averaging (simple low-pass) to 16 kHz
  const ratio = rate / TARGET;
  const outLen = Math.floor(all.length / ratio);
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const a = Math.floor(i * ratio), b = Math.min(all.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += all[j];
    const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(buf);
  const w = (off: number, str: string) => { for (let i = 0; i < str.length; i++) dv.setUint8(off + i, str.charCodeAt(i)); };
  w(0, "RIFF"); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, TARGET, true); dv.setUint32(28, TARGET * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, "data"); dv.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: "audio/wav" });
}

export function VoiceButton({ lang, disabled, onText }: { lang: string; disabled?: boolean; onText: (t: string) => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "rec" | "work">("idle");
  const [secs, setSecs] = useState(0);
  const [ok, setOk] = useState<Record<string, boolean> | null>(null);
  const r = useRef<{ ctx?: AudioContext; stream?: MediaStream; node?: ScriptProcessorNode; chunks: Float32Array[]; timer?: number; t0: number }>({ chunks: [], t0: 0 });

  useEffect(() => { fetch("/api/stt").then((x) => x.json()).then((d) => setOk(d.available)).catch(() => setOk({})); }, []);
  useEffect(() => () => cleanup(), []);
  if (!ok || !ok[lang]) return null;

  function cleanup() {
    const s = r.current;
    if (s.timer) window.clearInterval(s.timer);
    s.node?.disconnect();
    s.stream?.getTracks().forEach((tr) => tr.stop());
    s.ctx?.close().catch(() => {});
    r.current = { chunks: [], t0: 0 };
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) { toast(t("voice.noMic")); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(node); node.connect(ctx.destination);
      r.current = { ctx, stream, node, chunks, t0: Date.now() };
      setSecs(0); setState("rec");
      r.current.timer = window.setInterval(() => {
        const s = Math.floor((Date.now() - r.current.t0) / 1000);
        setSecs(s);
        if (s >= MAX_S) stop();
      }, 250);
    } catch {
      toast(t("voice.denied"));
      cleanup(); setState("idle");
    }
  }

  async function stop() {
    const s = r.current;
    if (!s.ctx) return;
    const rate = s.ctx.sampleRate, chunks = s.chunks;
    cleanup();
    setState("work");
    try {
      const res = await fetch(`/api/stt?lang=${lang}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: toWav(chunks, rate) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || res.statusText);
      if (d.text) onText(d.text); else toast(t("voice.empty"));
    } catch (e: any) {
      toast(e?.message || t("voice.empty"));
    } finally { setState("idle"); }
  }

  const rec = state === "rec", work = state === "work";
  return (
    <button type="button" disabled={disabled || work} onClick={() => (rec ? stop() : start())}
      aria-label={rec ? t("voice.stop") : t("voice.start")} title={rec ? t("voice.stop") : t("voice.start")}
      className={cx("h-12 shrink-0 px-0 tnum", rec ? "btn-danger w-auto min-w-12 px-3" : "btn-secondary w-12")}>
      {work ? <Loader2 size={20} className="animate-spin" /> : rec ? <span className="inline-flex items-center gap-1.5"><Square size={16} />{secs}s</span> : <Mic size={20} />}
    </button>
  );
}

/** Small switch next to the microphone: the language you type or speak in, and the answer comes back in it.
 *  It does not change the language of the screen. */
export function QLangToggle() {
  const { t } = useTranslation();
  const { qLang, setQLang } = usePrefs();
  const next = qLang === "kn" ? "en" : "kn";
  return (
    <button type="button" onClick={() => setQLang(next)} title={t("chat.qLang")} aria-label={`${t("chat.qLang")}: ${qLang === "kn" ? "ಕನ್ನಡ" : "English"}`}
      className="btn-secondary h-12 shrink-0 gap-1.5 px-3 text-sm font-semibold">
      <Languages size={17} className="text-accent" />
      <span lang={qLang}>{qLang === "kn" ? "ಕನ್ನಡ" : "EN"}</span>
    </button>
  );
}
