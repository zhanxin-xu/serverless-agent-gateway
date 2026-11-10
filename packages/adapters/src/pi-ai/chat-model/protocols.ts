/**
 * The four protocols, and what differs between them for the gateway: how a
 * tool choice is expressed, which request fields the gateway owns, and how the
 * extra body joins pi-ai's request.
 *
 * Each protocol's pi-ai module is loaded on first use, so a function only
 * loads the SDK of the protocol it talks.
 */
import type { ToolChoice } from "@gateway/core";
import type { Api, AssistantMessageEventStream, Model, StreamOptions, TranscriptContext } from "@earendil-works/pi-ai";

type Payload = Record<string, unknown>;
type StreamFunction = (model: Model<Api>, context: TranscriptContext, options: StreamOptions & { toolChoice?: unknown }) => AssistantMessageEventStream;

interface Spec {
  load(): Promise<StreamFunction>;
  /** The tool choice as pi-ai takes it for this protocol (`toolChoice` option); undefined leaves the protocol's default. */
  toolChoice(choice: ToolChoice): unknown;
  /** Request fields the gateway builds: the extra body can't set them. */
  reserved: readonly string[];
  /** pi-ai's request with the extra body merged in, what the tool choice still needs, and who it's for. */
  patch(payload: Payload, extra: Payload, call: Call): Payload;
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

export const PROTOCOLS = {
  "openai-responses": {
    load: async () => (await import("@earendil-works/pi-ai/api/openai-responses")).stream as StreamFunction,
    toolChoice: (choice) => (typeof choice === "object" ? { type: "function", name: choice.tool } : choice),
    reserved: ["model", "input", "instructions", "tools", "tool_choice", "stream", "store", "safety_identifier", "user"],
    // Calls are stateless (store: false), so reasoning comes back only when asked for encrypted, and
    // that whole item is what the next request must carry. Extra `include` entries are kept.
    patch: (payload, extra, { endUser }) => {
      const include = new Set([...(Array.isArray(extra.include) ? extra.include : []), "reasoning.encrypted_content"]);
      return { ...payload, ...extra, include: [...include], ...openaiEndUser(endUser) };
    },
  },
  "openai-completions": {
    load: async () => (await import("@earendil-works/pi-ai/api/openai-completions")).stream as StreamFunction,
    toolChoice: (choice) => (typeof choice === "object" ? { type: "function", function: { name: choice.tool } } : choice),
    reserved: ["model", "messages", "tools", "tool_choice", "stream", "stream_options", "safety_identifier", "user"],
    patch: (payload, extra, { endUser }) => ({ ...payload, ...extra, ...openaiEndUser(endUser) }),
  },
  "anthropic-messages": {
    load: async () => (await import("@earendil-works/pi-ai/api/anthropic-messages")).stream as StreamFunction,
    // Forcing a tool turns thinking off, and errors on models that think by default: the model is
    // asked instead (the default, "auto"), and a plain-text answer ends the turn (src/agent/loop.ts).
    // Keeping tool_choice the same on every call also keeps the cached messages valid.
    toolChoice: (choice) => (choice === "none" ? "none" : undefined),
    reserved: ["model", "messages", "system", "tools", "tool_choice", "stream"],
    // Anthropic's per-user identity is metadata.user_id; other metadata from the extra body is kept.
    patch: (payload, extra, { endUser }) => {
      const merged = { ...payload, ...extra };
      return endUser ? { ...merged, metadata: { ...(merged.metadata as Payload | undefined), user_id: endUser } } : merged;
    },
  },
  "google-generative-ai": {
    load: async () => (await import("@earendil-works/pi-ai/api/google-generative-ai")).stream as StreamFunction,
    toolChoice: (choice) => (choice === "none" ? "none" : "any"),
    // The SDK's request is { model, contents, config }: the extra body goes into config.
    // Gemini takes no per-user identity.
    reserved: ["systemInstruction", "tools", "toolConfig"],
    patch: (payload, extra, { choice }) => {
      const config = { ...(payload.config as Payload | undefined), ...extra };
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

/** The extra body (setting `name`), checked: none of the fields the gateway builds. */
export function checkedExtraBody(protocol: Protocol, extra: Payload, name: string): Payload {
  const reserved = PROTOCOLS[protocol].reserved.filter((key) => Object.hasOwn(extra, key));
  if (reserved.length) throw new Error(`${name} 不能设置 ${reserved.join("、")}（由网关生成）`);
  return extra;
}
