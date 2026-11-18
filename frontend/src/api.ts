// Talks only to the control centre on this school computer. Nothing goes to the internet.

const TOKEN_KEY = "is_token";
const ROLE_KEY = "is_role";
const NAME_KEY = "is_teacher_name";

export function safeGet(store: Storage | undefined, k: string): string | null {
  try { return store ? store.getItem(k) : null; } catch { return null; }
}
export function safeSet(store: Storage | undefined, k: string, v: string | null) {
  try { if (!store) return; v === null ? store.removeItem(k) : store.setItem(k, v); } catch { /* private mode */ }
}
const ss = typeof sessionStorage !== "undefined" ? sessionStorage : undefined;
const ls = typeof localStorage !== "undefined" ? localStorage : undefined;

export const auth = {
  token: () => safeGet(ls, TOKEN_KEY),
  role: () => safeGet(ls, ROLE_KEY),
  set(token: string, role: string) { safeSet(ls, TOKEN_KEY, token); safeSet(ls, ROLE_KEY, role); },
  clear() { safeSet(ls, TOKEN_KEY, null); safeSet(ls, ROLE_KEY, null); },
  teacherName: () => safeGet(ls, NAME_KEY) || "",
  setTeacherName: (n: string) => safeSet(ls, NAME_KEY, n),
};

export function deviceId(): string {
  let id = safeGet(ls, "is_device");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    safeSet(ls, "is_device", id);
  }
  return id;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  const t = auth.token();
  if (t) h["X-Auth"] = t;
  const n = auth.teacherName();
  if (n) h["X-Teacher"] = encodeURIComponent(n).slice(0, 60);
  return h;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
      headers: headers(opts.body !== undefined),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "offline");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.detail || msg; } catch { /* not json */ }
    if (res.status === 401) window.dispatchEvent(new CustomEvent("is-auth-required", { detail: msg }));
    throw new ApiError(res.status, msg);
  }
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("json") ? res.json() : (res.text() as any)) as T;
}

export type StreamEvent =
  | { type: "token"; text: string }
  | { type: "queue"; position: number; eta_s: number }
  | { type: "start"; engine: string; mode: string; model?: string }
  | { type: "done"; ttft: number; tps: number; tokens: number; engine?: string; mode?: string; finish?: string }
  | { type: "blocked"; category: string; text: string }
  | { type: "notice"; text: string }
  | { type: "meta"; title: string }
  | { type: "error"; code?: string; message: string };

/** POST that returns server-sent events, read with fetch so it works in older browsers too. */
export async function stream(path: string, body: unknown, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: headers(true), body: JSON.stringify(body), signal });
  } catch (e: any) {
    if (e?.name === "AbortError") return;
    onEvent({ type: "error", code: "offline", message: "offline" });
    return;
  }
  if (!res.ok || !res.body) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail || msg; } catch { /* */ }
    if (res.status === 401) window.dispatchEvent(new CustomEvent("is-auth-required", { detail: msg }));
    onEvent({ type: "error", code: String(res.status), message: msg });
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data:")) {
            try { onEvent(JSON.parse(line.slice(5).trim())); } catch { /* partial */ }
          }
        }
      }
    }
  } catch (e: any) {
    if (e?.name !== "AbortError") onEvent({ type: "error", code: "offline", message: "offline" });
  }
}

/** Live updates (progress, gauges, events). Reconnects by itself. */
export function live(onMsg: (topic: string, data: any) => void): () => void {
  let es: EventSource | null = null;
  let closed = false;
  let retry: number | undefined;
  const open = () => {
    const t = auth.token();
    es = new EventSource("/api/live" + (t ? `?token=${encodeURIComponent(t)}` : ""));
    es.onmessage = (e) => {
      try { const m = JSON.parse(e.data); onMsg(m.topic, m.data); } catch { /* */ }
    };
    es.onerror = () => {
      es?.close();
      if (!closed) retry = window.setTimeout(open, 3000);
    };
  };
  open();
  return () => { closed = true; es?.close(); if (retry) clearTimeout(retry); };
}

export const fmt = {
  time: (ts?: number | null) => ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "–",
  date: (ts?: number | null) => ts ? new Date(ts * 1000).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "–",
  dateTime: (ts?: number | null) => ts ? new Date(ts * 1000).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–",
  minutes: (s?: number | null) => s == null ? "–" : s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.round(s / 60)} min`,
  n1: (x?: number | null) => (x == null ? "–" : x.toFixed(1)),
  n0: (x?: number | null) => (x == null ? "–" : Math.round(x).toString()),
};
