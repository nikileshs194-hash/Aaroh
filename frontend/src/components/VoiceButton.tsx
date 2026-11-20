import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Languages, Loader2, Mic, X } from "lucide-react";
import { usePrefs } from "../prefs";
import { toast } from "./ui";

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
  const canvas = useRef<HTMLCanvasElement>(null);
  const r = useRef<{ ctx?: AudioContext; stream?: MediaStream; node?: ScriptProcessorNode; analyser?: AnalyserNode;
    chunks: Float32Array[]; timer?: number; raf?: number; t0: number; levels: number[] }>({ chunks: [], t0: 0, levels: [] });

  useEffect(() => { fetch("/api/stt").then((x) => x.json()).then((d) => setOk(d.available)).catch(() => setOk({})); }, []);
  useEffect(() => () => cleanup(), []);
  // Live waveform: one bar per ~60 ms of sound level, scrolling from right to left.
  useEffect(() => {
    if (state !== "rec") return;
    let last = 0;
    const draw = (now: number) => {
      const s = r.current, cv = canvas.current;
      if (!s.analyser || !cv) return;
      if (now - last > 60) {
        last = now;
        const buf = new Uint8Array(s.analyser.fftSize);
        s.analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        s.levels.push(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        if (s.levels.length > 400) s.levels.shift();
      }
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      const g = cv.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = getComputedStyle(cv).color;
      const bar = 3, gap = 3, n = Math.floor(w / (bar + gap));
      const lv = s.levels.slice(-n);
      for (let k = 0; k < n; k++) {
        const v = lv[k - (n - lv.length)] ?? 0;
        const bh = Math.max(3, v * (h - 4));
        const x = k * (bar + gap);
        g.globalAlpha = k < n - lv.length ? 0.25 : 1;
        g.beginPath();
        g.roundRect ? g.roundRect(x, (h - bh) / 2, bar, bh, 1.5) : g.rect(x, (h - bh) / 2, bar, bh);
        g.fill();
      }
      s.raf = requestAnimationFrame(draw);
    };
    r.current.raf = requestAnimationFrame(draw);
    return () => { if (r.current.raf) cancelAnimationFrame(r.current.raf); };
  }, [state]);

  if (!ok || !ok[lang]) return null;

  function cleanup() {
    const s = r.current;
    if (s.timer) window.clearInterval(s.timer);
    if (s.raf) cancelAnimationFrame(s.raf);
    s.node?.disconnect();
    s.stream?.getTracks().forEach((tr) => tr.stop());
    s.ctx?.close().catch(() => {});
    r.current = { chunks: [], t0: 0, levels: [] };
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) { toast(t("voice.noMic")); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(analyser); src.connect(node); node.connect(ctx.destination);
      r.current = { ctx, stream, node, analyser, chunks, t0: Date.now(), levels: [] };
      setSecs(0); setState("rec");
      r.current.timer = window.setInterval(() => {
        const sec = Math.floor((Date.now() - r.current.t0) / 1000);
        setSecs(sec);
        if (sec >= MAX_S) finish();
      }, 250);
    } catch {
      toast(t("voice.denied"));
      cleanup(); setState("idle");
    }
  }

  function cancel() { cleanup(); setState("idle"); }

  async function finish() {
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

  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <>
      <button type="button" disabled={disabled || state !== "idle"} onClick={start}
        aria-label={t("voice.start")} title={t("voice.start")} className="btn-ghost h-11 w-11 shrink-0 rounded-xl px-0">
        <Mic size={20} />
      </button>
      {state !== "idle" && (
        // Covers the question box while recording: live sound waves, timer, cancel and done.
        <div className="absolute inset-0 z-10 flex items-center gap-3 rounded-2xl bg-surface px-3" role="status" aria-live="polite">
          {state === "rec" ? (
            <>
              <button type="button" onClick={cancel} aria-label={t("voice.cancel")} title={t("voice.cancel")}
                className="btn-ghost h-10 w-10 shrink-0 rounded-full px-0 text-muted"><X size={20} /></button>
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
              </span>
              <canvas ref={canvas} className="h-10 min-w-0 flex-1 text-accent" aria-label={t("voice.listening")} />
              <span className="w-10 shrink-0 text-right text-sm tnum text-muted">{mmss}</span>
              <button type="button" onClick={finish} aria-label={t("voice.stop")} title={t("voice.stop")}
                className="btn-primary h-10 w-10 shrink-0 rounded-full px-0"><Check size={20} /></button>
            </>
          ) : (
            <span className="flex flex-1 items-center justify-center gap-2 text-sm text-muted">
              <Loader2 size={18} className="animate-spin text-accent" />{t("voice.working")}
            </span>
          )}
        </div>
      )}
    </>
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
      className="btn-ghost h-11 shrink-0 gap-1.5 rounded-xl px-2.5 text-sm font-semibold sm:px-3">
      <Languages size={17} className="hidden text-accent sm:block" />
      <span lang={qLang}>{qLang === "kn" ? "ಕನ್ನಡ" : "EN"}</span>
    </button>
  );
}
