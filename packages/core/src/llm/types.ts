/**
 * Model messages: what goes into a model call and what comes out, in one
 * shape whatever protocol carries them (the chat model capability,
 * src/modules/model/capability.ts, turns them into a provider's wire format).
 *
 * An assistant message is stored exactly as the model returned it. Each block
 * keeps the provider's own replay data next to it (a reasoning object, a
 * signature) as an opaque string, and is sent back with it unchanged, so a
 * provider that needs its reasoning returned whole gets it whole. Replay data
 * is only meaningful to the identity that produced it (ModelIdentity).
 */

/** Who produced an assistant message, as the provider names it. Its replay data goes back only to the same identity. */
export interface ModelIdentity {
  /** The wire protocol. */
  api: string;
  /** The endpoint: the same model name behind another endpoint is another model. */
  provider: string;
  model: string;
}

export interface TextContent {
  type: "text";
  text: string;
  /** Replay data for the block, opaque. */
  textSignature?: string;
}

export interface ThinkingContent {
  type: "thinking";
  /** Readable reasoning, or its summary; may be empty when only the replay data is given. */
  thinking: string;
  /** The provider's whole reasoning object as it must be sent back, opaque. */
  thinkingSignature?: string;
  /** Reasoning the provider withheld: only `thinkingSignature` carries it. */
  redacted?: boolean;
}

export interface ToolCall {
  type: "toolCall";
  /** Unique per call; the tool result answers it by this id. */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Replay data for the call, opaque. */
  thoughtSignature?: string;
  /** Set when the model's arguments weren't valid JSON (`arguments` is then {}). */
  argumentsError?: string;
}

export interface ImageContent {
  type: "image";
  /** Base64, no data: prefix. */
  data: string;
  mimeType: string;
}

/**
 * Tokens and cost of one call. `input` excludes the tokens read from or written
 * to the prompt cache. A provider fills the cost only when the service billed
 * the call (`totalFromProvider`); otherwise the core prices the tokens by the
 * price table (src/pricing/) and says which entry it used.
 */
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Reasoning tokens, where the provider reports them (already counted in `output`). */
  reasoning?: number;
  totalTokens: number;
  /** USD: what the service billed (`totalFromProvider`), or priced from the table (`priceEntry`), else 0. */
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; totalFromProvider?: boolean; priceEntry?: string };
}

export type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

/** The model's whole output for one call, verbatim: its blocks in the order it produced them. */
export interface AssistantMessage extends ModelIdentity {
  role: "assistant";
  content: Array<TextContent | ThinkingContent | ToolCall>;
  usage: Usage;
  stopReason: StopReason;
  timestamp: number;
  responseId?: string;
  errorMessage?: string;
}

export interface UserMessage {
  role: "user";
  content: string | Array<TextContent | ImageContent>;
  timestamp: number;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: Array<TextContent | ImageContent>;
  isError: boolean;
  timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

/** A tool as the model is told about it: JSON Schema parameters. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * What the model must do this call: call some tool, call none, or call this
 * one. A provider maps it onto what its protocol can express; where it can't
 * force a tool, it asks, and the loop falls back on plain text (src/agent/loop.ts).
 */
export type ToolChoice = "required" | "none" | { tool: string };

export interface LlmRequest {
  systemPrompt: string;
  messages: Message[];
  tools: ToolDefinition[];
  toolChoice: ToolChoice;
  /** Stable per chat: lets the provider keep the chat's requests on one prompt cache. */
  cacheKey?: string;
  /** The person this call answers, opaque and stable (llm/end-user.ts): the provider's per-user abuse identity. */
  endUser?: string;
  /** Give up after this long (a transient ModelCallError). */
  timeoutMs: number;
}
