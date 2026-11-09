/**
 * Messages the agent wrote that never reached the chat because the message
 * they replied to no longer took replies (QQ: 5 minutes after a group
 * message). The outbox refuses those sends with an error starting with
 * REPLY_WINDOW_CLOSED that tells the model to stop; each later turn opens with
 * a reminder of them (undelivered) until the agent gets a message through, so
 * it can say it when someone next writes in the chat.
 */
import { toolCalls } from "../llm/content.js";
import type { ToolCall } from "../llm/types.js";
import { isEvent, type SessionEvent } from "./events.js";

export const REPLY_WINDOW_CLOSED = "reply window closed";

/** How tools report a thrown error (modules/registry.ts). */
const REFUSED = `Error: ${REPLY_WINDOW_CLOSED}`;

/** What a send call wanted to deliver, in a few words: its text, or what it was sending. */
function describeSend(call: ToolCall): string {
  const what = call.arguments.text ?? call.arguments.path ?? call.arguments.name;
  return typeof what === "string" && what.trim() ? what.trim() : call.name;
}

/**
 * What the agent tried to send since it last got a message through, but
 * couldn't because the reply window had closed. `isSend` tells message-sending
 * tools apart (by role, never by name).
 */
export function undelivered(events: SessionEvent[], isSend: (tool: string) => boolean): string[] {
  const calls = new Map<string, ToolCall>();
  let missed: string[] = [];
  for (const e of events) {
    if (isEvent(e, "assistant/message")) {
      for (const call of toolCalls(e.data.message)) calls.set(call.id, call);
      continue;
    }
    if (!isEvent(e, "tool/result")) continue;
    const call = calls.get(e.data.callId);
    if (!call || !isSend(call.name)) continue;
    if (e.data.output.startsWith(REFUSED)) missed.push(describeSend(call));
    else if (!e.data.output.startsWith("Error:")) missed = [];
  }
  return missed;
}
