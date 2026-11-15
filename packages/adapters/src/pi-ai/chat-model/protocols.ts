/**
 * The four protocols, and what differs between them for the gateway: how a
 * tool choice is expressed, and what the gateway adds to pi-ai's request.
 * The instance's body override (MODEL_{ID}_EXTRA_BODY) is merged in after
 * that, level by level, and can change any field (overrideBody in the core).
 *
 * Each protocol's pi-ai module is loaded on first use, so a function only
 * loads the SDK of the protocol it talks.
 */
import { createHash } from "node:crypto";
import type { ToolChoice } from "@gateway/core";
import type { Api, AssistantMessageEventStream, Model, StreamOptions, TranscriptContext } from "@earendil-works/pi-ai";

type Payload = Record<string, unknown>;
type StreamFunction = (model: Model<Api>, context: TranscriptContext, options: StreamOptions & { toolChoice?: unknown }) => AssistantMessageEventStream;

interface Spec {
  load(): Promise<StreamFunction>;
  /** The tool choice as pi-ai takes it for this protocol (`toolChoice` option); undefined leaves the protocol's default. */
  toolChoice(choice: ToolChoice): unknown;
  /** pi-ai's request with what the tool choice still needs, and who it's for. */
  patch(payload: Payload, call: Call): Payload;
}

/** What the gateway adds to each request: the tool choice, and the person it answers (LlmRequest.endUser). */
interface Call {
  choice: ToolChoice;
  endUser?: string;
}

/**
 * The person a call answers, where OpenAI-style APIs take one: `safety_identifier`
 * (OpenAI's per-user abuse identity) and `user` (OpenRouter's, which it turns
 * into the upstream identity; OpenAI's older field).
 */
const openaiEndUser = (endUser?: string): Payload => (endUser ? { safety_identifier: endUser, user: endUser } : {});

const forced = (choice: ToolChoice): string | undefined => (typeof choice === "object" ? choice.tool : undefined);

/** The id pi-ai makes up for an assistant message that has none of its own: its place in the request. */
const PLACED_ID = /^msg_pi_\d+(?:_\d+)?$/;

/**
 * An assistant message the model in use didn't write (one an admin sent in the
 * bot's name, one from another model or provider) carries no id from OpenAI,
 * and pi-ai numbers it by its place in the request (msg_pi_<n>). With
 * store: true OpenAI keeps every input item by its id, so once the history
 * shifts (compaction, a trim) the same id comes with other text, and every
 * call fails with "An input item conflicts with an existing record" until the
 * chat is reset. Each such message gets an id from its text instead: the same
 * text always carries the same id, and two equal ones in a request differ by
 * which of them it is.
 */
function ownIds(input: unknown): unknown {
  if (!Array.isArray(input)) return input;
  const seen = new Map<string, number>();
  return input.map((item: Payload) => {
    if (item?.type !== "message" || item.role !== "assistant" || typeof item.id !== "string" || !PLACED_ID.test(item.id)) return item;
    const text = (Array.isArray(item.content) ? item.content : []).map((c: Payload) => (typeof c?.text === "string" ? c.text : "")).join("\n");
    const n = seen.get(text) ?? 0;
    seen.set(text, n + 1);
    return { ...item, id: `msg_${createHash("sha256").update(`${n}\n${text}`).digest("hex").slice(0, 48)}` };
  });
}

export const PROTOCOLS = {
  "openai-responses": {
    load: async () => (await import("@earendil-works/pi-ai/api/openai-responses")).stream as StreamFunction,
    toolChoice: (choice) => (typeof choice === "object" ? { type: "function", name: choice.tool } : choice),
    // Every call carries the whole conversation (pi-ai sends store: false), so reasoning is asked for
    // encrypted, and that whole item is what the next request must carry. The body override can
    // turn store on: the messages that have no id from OpenAI get one that stays theirs (ownIds).
    patch: (payload, { endUser }) => {
      const include = new Set([...(Array.isArray(payload.include) ? payload.include : []), "reasoning.encrypted_content"]);
      return { ...payload, input: ownIds(payload.input), include: [...include], ...openaiEndUser(endUser) };
    },
  },
  "openai-completions": {
    load: async () => (await import("@earendil-works/pi-ai/api/openai-completions")).stream as StreamFunction,
    toolChoice: (choice) => (typeof choice === "object" ? { type: "function", function: { name: choice.tool } } : choice),
    patch: (payload, { endUser }) => ({ ...payload, ...openaiEndUser(endUser) }),
  },
  "anthropic-messages": {
    load: async () => (await import("@earendil-works/pi-ai/api/anthropic-messages")).stream as StreamFunction,
    // Forcing a tool turns thinking off, and errors on models that think by default: the model is
    // asked instead (the default, "auto"), and a plain-text answer ends the turn (src/agent/loop.ts).
    // Keeping tool_choice the same on every call also keeps the cached messages valid.
    toolChoice: (choice) => (choice === "none" ? "none" : undefined),
    // Anthropic's per-user identity is metadata.user_id.
    patch: (payload, { endUser }) => (endUser ? { ...payload, metadata: { ...(payload.metadata as Payload | undefined), user_id: endUser } } : payload),
  },
  "google-generative-ai": {
    load: async () => (await import("@earendil-works/pi-ai/api/google-generative-ai")).stream as StreamFunction,
    toolChoice: (choice) => (choice === "none" ? "none" : "any"),
    // The SDK's request is { model, contents, config }. Gemini takes no per-user identity.
    patch: (payload, { choice }) => {
      const config = { ...(payload.config as Payload | undefined) };
      const tool = forced(choice);
      if (tool) {
        // pi-ai sets mode ANY; naming the function narrows it to that one.
        const toolConfig = (config.toolConfig ?? {}) as Payload;
        const calling = (toolConfig.functionCallingConfig ?? {}) as Payload;
        config.toolConfig = { ...toolConfig, functionCallingConfig: { ...calling, allowedFunctionNames: [tool] } };
      }
      return { ...payload, config };
    },
  },
} satisfies Record<string, Spec>;

export type Protocol = keyof typeof PROTOCOLS;

export const isProtocol = (value: string): value is Protocol => Object.hasOwn(PROTOCOLS, value);

