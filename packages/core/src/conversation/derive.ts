/** The model input, derived from the event log. */
import { isEvent, userMessageText, visibleWindow, type SessionEvent } from "./events.js";

const SUMMARY_PREFIX = "（系统提示）以下是更早对话的摘要，原文已经删除：\n";

type Loader = (key: string) => Promise<string | null>;

/** Event types that reach the model's input; the rest are only in the log (turns, steps, tool-call markers…). */
const MODEL_VISIBLE = new Set(["user/message", "developer/message", "admin/message", "assistant/message", "tool/result", "tool/images", "compaction/summary"]);
export const modelSees = (type: string): boolean => MODEL_VISIBLE.has(type);

/** Events that can arrive while a step is running: messages from the chat, notes, an admin's words. */
const ARRIVALS = new Set(["user/message", "developer/message", "admin/message"]);

/**
 * Messages logged while a step was running (between its step/start and
 * step/end), which the model reads after that step's tool results, so a
 * function_call is always followed directly by its output. Maps each one's
 * seq to the step/end it follows, or to undefined while the step still runs.
 */
export function arrivedMidStep(events: SessionEvent[]): Map<number, number | undefined> {
  const moved = new Map<number, number | undefined>();
  let running: number[] | undefined;
  for (const e of events) {
    if (e.type === "step/start") running = [];
    else if (e.type === "step/end") {
      for (const seq of running ?? []) moved.set(seq, e.seq);
      running = undefined;
    } else if (running && ARRIVALS.has(e.type)) running.push(e.seq);
  }
  for (const seq of running ?? []) moved.set(seq, undefined);
  return moved;
}

/** The events in the order the model reads them: as logged, except what arrived mid-step comes after that step (arrivedMidStep). */
export function modelOrder(events: SessionEvent[]): SessionEvent[] {
  const moved = arrivedMidStep(events);
  const after = new Map<number, SessionEvent[]>();
  const last: SessionEvent[] = [];
  const ordered: SessionEvent[] = [];
  for (const e of events) {
    if (moved.has(e.seq)) {
      const end = moved.get(e.seq);
      if (end === undefined) last.push(e);
      else after.set(end, [...(after.get(end) ?? []), e]);
      continue;
    }
    ordered.push(e, ...(after.get(e.seq) ?? []));
  }
  return [...ordered, ...last];
}

/**
 * Responses API input for the visible window, in the order the model reads
 * it (modelOrder). Two adjustments keep the request valid without touching the log:
 *   - what arrived while a step was running comes after that step's tool results;
 *   - a function_call whose result never made it into the log (the run was
 *     killed) gets a synthetic "interrupted" output. Recovery normally
 *     appends a real tool/result first (see recoverOpenTurn).
 */
export async function deriveInput(events: SessionEvent[], loadImage: Loader): Promise<unknown[]> {
  const { summary, events: window } = visibleWindow(events);
  const input: unknown[] = [];
  if (summary) input.push({ role: "user", content: SUMMARY_PREFIX + summary.data.summary });

  const results = new Set(window.filter((e) => isEvent(e, "tool/result")).map((e) => (e as SessionEvent<"tool/result">).data.callId));
  for (const e of modelOrder(window)) {
    switch (e.type) {
      case "user/message":
        input.push(await userMessageItem(e as SessionEvent<"user/message">, loadImage));
        break;
      case "developer/message":
        input.push({ role: "developer", content: e.data.text });
        break;
      case "admin/message":
        // Said in the bot's name by an admin: as far as the model knows, it said this.
        input.push({ role: "assistant", content: e.data.text });
        break;
      case "assistant/message":
        input.push(...e.data.output);
        for (const item of e.data.output) {
          if (item.type === "function_call" && !results.has((item as { call_id: string }).call_id)) {
            input.push({
              type: "function_call_output",
              call_id: (item as { call_id: string }).call_id,
              output: "interrupted: the turn was cut off before this ran",
            });
          }
        }
        break;
      case "tool/result":
        input.push({ type: "function_call_output", call_id: e.data.callId, output: e.data.output });
        break;
      case "tool/images": {
        const parts = await imageParts(e.data.images, loadImage, "auto");
        if (parts.length) {
          input.push({ role: "user", content: [{ type: "input_text", text: "（系统提示）工具返回的图片：" }, ...parts] });
        }
        break;
      }
    }
  }
  return input;
}

async function imageParts(keys: string[], loadImage: Loader, detail: "low" | "auto") {
  const urls = await Promise.all(keys.map(loadImage));
  return urls.filter((u): u is string => Boolean(u)).map((url) => ({ type: "input_image", image_url: url, detail }));
}

async function userMessageItem(e: SessionEvent<"user/message">, loadImage: Loader) {
  let text = userMessageText(e);
  const keys = e.data.images ?? [];
  if (e.data.imagesFailed) text += "\n（有图片没加载出来）";
  if (!keys.length) return { role: "user", content: text };
  const parts = await imageParts(keys, loadImage, "low");
  if (parts.length < keys.length) text += "\n（有图片已过期，看不到了）";
  return { role: "user", content: [{ type: "input_text", text }, ...parts] };
}
