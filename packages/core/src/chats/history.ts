/**
 * A chat's history for people to read (the admin console), rendered from the
 * event log, which stays the only store: who said what, without the model's
 * reasoning, tool calls and system notes. It reaches as far back as the log
 * does (compaction and expiry remove older events).
 *
 *   user/message   → "user" (an admin's whisper → "hint")
 *   bot/sent       → "bot": everything it delivered, by tool or not
 *   admin/message  → "admin"
 */
import { isEvent, isWhisper, type SessionEvent } from "../conversation/events.js";
import type { ChatStore, ConsoleStore } from "../store/index.js";

export type HistoryRole = "user" | "bot" | "admin" | "hint";

export interface HistoryEntry {
  /** Unique in the chat. */
  id: string;
  /** Epoch ms. */
  time: number;
  /** The event it comes from. */
  seq: number;
  role: HistoryRole;
  sender?: string;
  text: string;
}

/** History lines in log order. */
export function historyFromEvents(events: SessionEvent[]): HistoryEntry[] {
  const lines: HistoryEntry[] = [];
  for (const e of events) {
    if (isEvent(e, "user/message")) {
      const images = e.data.images?.length ? `[图片×${e.data.images.length}]` : "";
      lines.push({
        id: e.data.eventId,
        time: e.time,
        seq: e.seq,
        role: isWhisper(e) ? "hint" : "user",
        sender: e.data.sender,
        text: [e.data.text, images].filter(Boolean).join(" "),
      });
    } else if (isEvent(e, "bot/sent")) {
      lines.push({ id: `sent-${e.seq}`, time: e.time, seq: e.seq, role: "bot", text: e.data.text });
    } else if (isEvent(e, "admin/message")) {
      lines.push({ id: `admin-${e.seq}`, time: e.time, seq: e.seq, role: "admin", text: e.data.text });
    }
  }
  return lines;
}

export interface HistoryPage {
  /** Oldest first. */
  lines: HistoryEntry[];
  /** The newest event read: ask for what's after it next time. */
  through: number;
  /** Whether there are older lines than these. */
  more: boolean;
}

/** Events read per store call when paging back, and at most per page. */
const CHUNK = 300;
const MAX_READ = 3000;

/** What was said after event `after`: the console polls with this, reading only new events. */
export async function historyAfter(store: Pick<ChatStore, "open">, chat: string, after: number): Promise<HistoryPage> {
  const { events } = await store.open(chat, after);
  return { lines: historyFromEvents(events as SessionEvent[]), through: events.at(-1)?.seq ?? after, more: false };
}

/** Up to `limit` lines before event `before`, reading the log backwards a chunk at a time. */
export async function historyBefore(store: Pick<ConsoleStore, "recentEvents">, chat: string, before: number, limit: number): Promise<HistoryPage> {
  let events: SessionEvent[] = [];
  let through = -1;
  for (;;) {
    const { events: chunk } = await store.recentEvents(chat, events[0]?.seq ?? before, CHUNK);
    if (through < 0) through = chunk[0]?.seq ?? -1;
    events = [...(chunk as SessionEvent[]).reverse(), ...events];
    const lines = historyFromEvents(events);
    const exhausted = chunk.length < CHUNK;
    if (lines.length > limit || exhausted || events.length >= MAX_READ) {
      return { lines: lines.slice(-limit), through, more: lines.length > limit || !exhausted };
    }
  }
}
