/**
 * The chat model over pi-ai: OpenAI Responses, OpenAI Chat Completions,
 * Anthropic Messages or Google Gemini, at any endpoint that speaks one.
 *
 * Messages go to pi-ai as they are (the core's shapes are pi-ai's), and its
 * answer comes back whole: pi-ai keeps each provider's replay data in the
 * blocks (the Responses reasoning item, Anthropic's thinking signature,
 * Gemini's thought signature) and sends it back unchanged when the identity
 * matches (api, provider = the base URL, model). It is used the way DeepSeek
 * Harness's pi-ai adapter uses it: one SDK attempt per call (retries are the
 * agent run's), a session id for the prompt cache, failures classified by text.
 *
 * Reasoning is left to the provider's defaults and the extra body (the model
 * is declared non-reasoning, so pi-ai adds no reasoning fields of its own).
 */
import {
  chatModelCapability,
  ModelCallError,
  notReady,
  READY,
  type AssistantMessage,
  type ChatModel,
  type LlmRequest,
  type ModelAccount,
  type Provider,
} from "@gateway/core";
import type { Api, AssistantMessage as PiAssistantMessage, Message, Model, Tool } from "@earendil-works/pi-ai";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import { piAiConfig } from "./config.js";
import { callError } from "./errors.js";
import { checkedExtraBody, PROTOCOLS } from "./protocols.js";
import { CONFIG } from "./settings.js";

/** Anthropic requires an output cap; without MODEL_MAX_OUTPUT_TOKENS it gets this one. */
const DEFAULT_MAX_OUTPUT_TOKENS = 32_000;

/** The model as pi-ai describes it, from the settings. */
function piModel(): Model<Api> {
  const { api, baseUrl, model, prices, maxOutputTokens, contextTokens } = piAiConfig;
  return {
    id: model,
    name: model,
    api,
    provider: baseUrl,
    baseUrl,
    input: ["text", "image"],
    reasoning: false,
    // Cache writes are priced as input: providers that bill them extra report their own cost.
    cost: { input: prices.input, output: prices.output, cacheRead: prices.cached, cacheWrite: prices.input },
    contextWindow: contextTokens,
    maxTokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  };
}

/** A finished answer, or the failure it reports. */
function answer(message: PiAssistantMessage, timeoutMs: number, timedOut: boolean): AssistantMessage {
  const { stopReason } = message;
  if (stopReason === "stop" || stopReason === "length" || stopReason === "toolUse") return { ...message, stopReason };
  if (stopReason === "aborted" && timedOut) throw new ModelCallError(`model: no response within ${Math.round(timeoutMs / 1000)}s`, true);
  throw callError(message.errorMessage || `the call ended with ${stopReason}`);
}

async function complete(request: LlmRequest): Promise<AssistantMessage> {
  const { api, apiKey, extraHeaders, maxOutputTokens } = piAiConfig;
  const protocol = PROTOCOLS[api];
  let extra: Record<string, unknown>;
  try {
    extra = checkedExtraBody(api, piAiConfig.extraBody);
  } catch (err) {
    throw new ModelCallError(err instanceof Error ? err.message : String(err), false);
  }
  const context = normalizeContext({
    systemPrompt: request.systemPrompt,
    // The core's message shapes are pi-ai's.
    messages: request.messages as Message[],
    // JSON Schema parameters, sent as they are.
    tools: request.tools as unknown as Tool[],
  });
  const toolChoice = request.tools.length ? protocol.toolChoice(request.toolChoice) : undefined;
  const signal = AbortSignal.timeout(request.timeoutMs);
  const stream = (await protocol.load())(piModel(), context, {
    apiKey,
    headers: extraHeaders,
    signal,
    maxRetries: 0,
    ...(request.cacheKey ? { sessionId: request.cacheKey } : {}),
    ...(maxOutputTokens ? { maxTokens: maxOutputTokens } : {}),
    ...(toolChoice !== undefined ? { toolChoice } : {}),
    onPayload: (payload) => protocol.patch(payload as Record<string, unknown>, extra, request.toolChoice),
  });
  return answer(await stream.result(), request.timeoutMs, signal.aborted);
}

/**
 * The provider. `account`, when given, reads what's left on the key from the
 * service that issued it (the deployment knows which: OpenRouter's, say).
 */
export function piAiChatModel(options: { account?: ModelAccount } = {}): Provider<ChatModel> {
  const { account } = options;
  const model: ChatModel = {
    identity: () => ({ api: piAiConfig.api, provider: piAiConfig.baseUrl, model: piAiConfig.model }),
    complete,
    ...(account
      ? { balance: () => account.balance({ baseUrl: piAiConfig.baseUrl, apiKey: piAiConfig.apiKey, headers: piAiConfig.extraHeaders }) }
      : {}),
  };
  return {
    id: "pi-ai",
    capability: chatModelCapability.id,
    config: CONFIG,
    available: () => (piAiConfig.apiKey ? READY : notReady("还没填模型的 API Key")),
    create: () => model,
  };
}
