/**
 * The four protocols, and what differs between them for the gateway: how a
 * tool choice is expressed, and what the gateway adds to pi-ai's request.
 * The instance's body override (MODEL_{ID}_EXTRA_BODY) is merged in after
 * that, level by level, and can change any field (overrideBody in the core).
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

export const PROTOCOLS = {
  "openai-responses": {
    load: async () => (await import("@earendil-works/pi-ai/api/openai-responses")).stream as StreamFunction,
    toolChoice: (choice) => (typeof choice === "object" ? { type: "function", name: choice.tool } : choice),
    // Every call carries the whole conversation (pi-ai sends store: false), so reasoning is asked for
    // encrypted, and that whole item is what the next request must carry.
    patch: (payload, { endUser }) => {
      const include = new Set([...(Array.isArray(payload.include) ? payload.include : []), "reasoning.encrypted_content"]);
      return { ...payload, include: [...include], ...openaiEndUser(endUser) };
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

