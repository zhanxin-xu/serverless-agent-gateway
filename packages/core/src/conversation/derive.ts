/** The model's messages, derived from the event log. */
import { imageFromDataUrl, toolCalls } from "../llm/content.js";
import type { ImageContent, Message, ModelIdentity, TextContent, ToolResultMessage, Usage, UserMessage } from "../llm/types.js";
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
 * tool call is always followed directly by its result. Maps each one's
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

/** Who said an admin's message: no model, so no replay data is ever sent back for it. */
const ADMIN: ModelIdentity = { api: "gateway", provider: "gateway", model: "admin" };

const NO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const text = (value: string): TextContent => ({ type: "text", text: value });

/**
 * The model's messages for the visible window, in the order it reads them
 * (modelOrder). Two adjustments keep the request valid without touching the log:
 *   - what arrived while a step was running comes after that step's tool results;
 *   - a tool call whose result never made it into the log (the run was
 *     killed) gets a synthetic "interrupted" result. Recovery normally
 *     appends a real tool/result first (see recoverOpenTurn).
 * System notes (developer/message) are user messages: they start with
 * "（系统提示）", and every protocol takes a user message anywhere.
 */
export async function deriveMessages(events: SessionEvent[], loadImage: Loader): Promise<Message[]> {
  const { summary, events: window } = visibleWindow(events);
  const messages: Message[] = [];
  if (summary) messages.push({ role: "user", content: SUMMARY_PREFIX + summary.data.summary, timestamp: summary.time });

  const answered = new Set(window.filter((e) => isEvent(e, "tool/result")).map((e) => (e as SessionEvent<"tool/result">).data.callId));
  const toolNames = new Map<string, string>();
  for (const e of modelOrder(window)) {
    switch (e.type) {
      case "user/message":
        messages.push(await userMessage(e as SessionEvent<"user/message">, loadImage));
        break;
      case "developer/message":
        messages.push({ role: "user", content: e.data.text, timestamp: e.time });
        break;
      case "admin/message":
        // Said in the bot's name by an admin: as far as the model knows, it said this.
        messages.push({ role: "assistant", ...ADMIN, content: [text(e.data.text)], usage: NO_USAGE, stopReason: "stop", timestamp: e.time });
        break;
      case "assistant/message": {
        const message = e.data.message;
        messages.push(message);
        for (const call of toolCalls(message)) {
          toolNames.set(call.id, call.name);
          if (answered.has(call.id)) continue;
          messages.push(toolResult(call.id, call.name, "interrupted: the turn was cut off before this ran", e.time));
        }
        break;
      }
      case "tool/result":
        messages.push(toolResult(e.data.callId, toolNames.get(e.data.callId) ?? "", e.data.output, e.time));
        break;
      case "tool/images": {
        const images = await loadImages(e.data.images, loadImage);
        if (images.length) messages.push({ role: "user", content: [text("（系统提示）工具返回的图片："), ...images], timestamp: e.time });
        break;
      }
    }
  }
  return messages;
}

/** A tool's output as the model reads it; output starting with "Error:" is how tools report failure (modules/registry.ts). */
function toolResult(toolCallId: string, toolName: string, output: string, timestamp: number): ToolResultMessage {
  return { role: "toolResult", toolCallId, toolName, content: [text(output)], isError: output.startsWith("Error:"), timestamp };
}

async function loadImages(keys: string[], loadImage: Loader): Promise<ImageContent[]> {
  const urls = await Promise.all(keys.map(loadImage));
  return urls.flatMap((url) => {
    const image = url ? imageFromDataUrl(url) : undefined;
    return image ? [image] : [];
  });
}

async function userMessage(e: SessionEvent<"user/message">, loadImage: Loader): Promise<UserMessage> {
  let body = userMessageText(e);
  const keys = e.data.images ?? [];
  if (e.data.imagesFailed) body += "\n（有图片没加载出来）";
  if (!keys.length) return { role: "user", content: body, timestamp: e.time };
  const images = await loadImages(keys, loadImage);
  if (images.length < keys.length) body += "\n（有图片已过期，看不到了）";
  return { role: "user", content: [text(body), ...images], timestamp: e.time };
}
