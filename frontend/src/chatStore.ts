import { safeGet, safeSet } from "./api";

/** Chat history lives only in this browser on this device (localStorage). Nothing is sent to or kept on the
 *  school computer except the question being answered right now. */
export type Msg = { role: "user" | "assistant"; content: string; lang?: string; blocked?: boolean; stats?: { ttft: number; tps: number }; error?: boolean };
export type Conv = { id: string; title: string; created: number; updated: number; msgs: Msg[] };

const KEY = "aaroh_chats";
const OLD_KEY = "is_chat";
const MAX_CHATS = 60;
const MAX_MSGS = 80;
const ls = typeof localStorage !== "undefined" ? localStorage : undefined;

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function titleOf(msgs: Msg[]): string {
  const q = msgs.find((m) => m.role === "user")?.content.trim().replace(/\s+/g, " ") || "New chat";
  return q.length > 48 ? q.slice(0, 47) + "…" : q;
}

function read(): Conv[] {
  try {
    const v = JSON.parse(safeGet(ls, KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function write(list: Conv[]) {
  // Newest first; if the browser runs out of space, drop the oldest chats and try again.
  let l = [...list].sort((a, b) => b.updated - a.updated).slice(0, MAX_CHATS);
  while (l.length) {
    try { ls?.setItem(KEY, JSON.stringify(l)); return; } catch { l = l.slice(0, -1); }
  }
  safeSet(ls, KEY, "[]");
}

/** One-time move of the single old chat into the new history. */
function migrate() {
  const old = safeGet(ls, OLD_KEY);
  if (!old) return;
  try {
    const msgs: Msg[] = JSON.parse(old);
    if (Array.isArray(msgs) && msgs.length) {
      const t = Date.now();
      write([{ id: newId(), title: titleOf(msgs), created: t, updated: t, msgs }, ...read()]);
    }
  } catch { /* ignore */ }
  safeSet(ls, OLD_KEY, null);
}

export function listChats(): Conv[] {
  migrate();
  return read().sort((a, b) => b.updated - a.updated);
}

export function getChat(id: string): Conv | undefined {
  return read().find((c) => c.id === id);
}

export function saveChat(id: string, msgs: Msg[]): Conv[] {
  const list = read();
  const now = Date.now();
  const i = list.findIndex((c) => c.id === id);
  const kept = msgs.slice(-MAX_MSGS);
  if (i >= 0) list[i] = { ...list[i], msgs: kept, title: titleOf(kept), updated: now };
  else list.push({ id, title: titleOf(kept), created: now, updated: now, msgs: kept });
  write(list);
  return listChats();
}

export function deleteChat(id: string): Conv[] {
  write(read().filter((c) => c.id !== id));
  return listChats();
}

export function deleteAllChats(): Conv[] {
  safeSet(ls, KEY, null);
  return [];
}

export function groupByDay(list: Conv[]): { label: "today" | "yesterday" | "week" | "earlier"; items: Conv[] }[] {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = start.getTime(), yesterday = today - 86400000, week = today - 6 * 86400000;
  const groups: Record<string, Conv[]> = { today: [], yesterday: [], week: [], earlier: [] };
  for (const c of list) {
    const k = c.updated >= today ? "today" : c.updated >= yesterday ? "yesterday" : c.updated >= week ? "week" : "earlier";
    groups[k].push(c);
  }
  return (["today", "yesterday", "week", "earlier"] as const).filter((k) => groups[k].length).map((k) => ({ label: k, items: groups[k] }));
}
