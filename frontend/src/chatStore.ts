import { api } from "./api";

/** Each student's chats are stored on the school computer under their own account (never online).
 *  A student only ever receives their own chats. */
export type Msg = { role: "user" | "assistant"; content: string; lang?: string; blocked?: boolean; stats?: { ttft: number; tps: number }; error?: boolean;
  sources?: { class: number | null; subject: string; page: number; score: number }[] };
export type ConvMeta = { id: string; title: string; created: number; updated: number };  // times in seconds

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const listChats = (): Promise<ConvMeta[]> => api<ConvMeta[]>("/api/chats");
export const getChat = (id: string): Promise<ConvMeta & { msgs: Msg[] }> => api(`/api/chats/${id}`);
export const saveChat = (id: string, msgs: Msg[]) => api(`/api/chats/${id}`, { method: "PUT", body: { msgs } });
export const deleteChat = (id: string) => api(`/api/chats/${id}`, { method: "DELETE" });
export const deleteAllChats = () => api("/api/chats", { method: "DELETE" });

export function groupByDay(list: ConvMeta[]): { label: "today" | "yesterday" | "week" | "earlier"; items: ConvMeta[] }[] {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = start.getTime() / 1000, yesterday = today - 86400, week = today - 6 * 86400;
  const groups: Record<string, ConvMeta[]> = { today: [], yesterday: [], week: [], earlier: [] };
  for (const c of list) {
    const k = c.updated >= today ? "today" : c.updated >= yesterday ? "yesterday" : c.updated >= week ? "week" : "earlier";
    groups[k].push(c);
  }
  return (["today", "yesterday", "week", "earlier"] as const).filter((k) => groups[k].length).map((k) => ({ label: k, items: groups[k] }));
}
