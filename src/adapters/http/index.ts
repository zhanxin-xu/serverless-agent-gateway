/**
 * Generic HTTP channel: POST JSON, get the agent's reply in the response.
 * Handy for testing and for wiring in any system that can make an HTTP call.
 *
 *   curl -X POST <BASE>/api/webhook/http \
 *     -H "Authorization: Bearer $HTTP_CHANNEL_TOKEN" \
 *     -d '{"conversationId":"demo","text":"hello"}'
 */
import crypto from "node:crypto";
import { CONFIG } from "./settings.js";
import { httpConfig } from "./config.js";
import { json, type ChannelAdapter, type ReceiveResult } from "../../channels/types.js";

interface HttpBody {
  text?: string;
  conversationId?: string;
  userId?: string;
  userName?: string;
  /** "group" when several people share the conversation. Default "private". */
  chatType?: "private" | "group";
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export const httpAdapter: ChannelAdapter = {
  name: "http",
  config: CONFIG,
  label: "HTTP",

  isConfigured() {
    return Boolean(httpConfig.token);
  },

  async receive(req, rawBody): Promise<ReceiveResult> {
    const auth = req.headers.get("authorization") ?? "";
    if (!safeEqual(auth, `Bearer ${httpConfig.token}`)) {
      return { kind: "respond", response: json({ error: "unauthorized" }, 401) };
    }

    let body: HttpBody;
    try {
      body = JSON.parse(rawBody) as HttpBody;
    } catch {
      return { kind: "respond", response: json({ error: "invalid json" }, 400) };
    }
    const text = body.text?.trim();
    if (!text) return { kind: "respond", response: json({ error: "text is required" }, 400) };

    return {
      kind: "message",
      message: {
        channel: "http",
        eventId: crypto.randomUUID(),
        conversationId: body.conversationId || "default",
        chatType: body.chatType === "group" ? "group" : "private",
        userId: body.userId || "anonymous",
        senderName: body.userName || undefined,
        text,
        replyContext: {},
      },
    };
  },
  // No `send`: the route returns the reply synchronously.
};
