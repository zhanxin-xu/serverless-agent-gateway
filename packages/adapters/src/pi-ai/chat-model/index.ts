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
 *
 * The provider is defined once and composed per endpoint (piAiChatModel), each
 * instance with its own settings and key.
 */
import { chatModelCapability, ModelCallError, notReady, READY, type AssistantMessage, type ChatModel, type LlmRequest, type Provider, overrideBody } from "@gateway/core";
import type { Api, AssistantMessage as PiAssistantMessage, Message, Model, Tool } from "@earendil-works/pi-ai";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import { piAiConfig, type PiAiConfig, type PiAiInstance } from "./config.js";
import { callError } from "./errors.js";
import { PROTOCOLS } from "./protocols.js";
import { chatModelSettings } from "./settings.js";

/** Anthropic requires an output cap; without MODEL_MAX_OUTPUT_TOKENS it gets this one. */
const DEFAULT_MAX_OUTPUT_TOKENS = 32_000;

/** The model as pi-ai describes it, from an instance's settings. */
function piModel(config: PiAiConfig): Model<Api> {
  const { api, baseUrl, model, maxOutputTokens, contextTokens } = config;
  return {
    id: model,
    name: model,
    api,
    provider: baseUrl,
    baseUrl,
    input: ["text", "image"],
    reasoning: false,
    // No prices here: the answer reports its tokens, and the core prices them (src/pricing/ in the core).
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
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

async function complete(config: PiAiConfig, request: LlmRequest): Promise<AssistantMessage> {
  const { api, apiKey, extraHeaders, maxOutputTokens } = config;
  const protocol = PROTOCOLS[api];
  let override: Record<string, unknown>;
  try {
    override = config.extraBody;
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
  const stream = (await protocol.load())(piModel(config), context, {
    apiKey,
    headers: extraHeaders,
    signal,
    maxRetries: 0,
    ...(request.cacheKey ? { sessionId: request.cacheKey } : {}),
    ...(maxOutputTokens ? { maxTokens: maxOutputTokens } : {}),
    ...(toolChoice !== undefined ? { toolChoice } : {}),
    // What the gateway adds, then the instance's override, level by level, last.
    onPayload: (payload) => overrideBody(protocol.patch(payload as Record<string, unknown>, { choice: request.toolChoice, endUser: request.endUser }), override),
  });
  return answer(await stream.result(), request.timeoutMs, signal.aborted);
}

/**
 * One chat model endpoint as a provider. A deployment composes as many as it
 * offers (OpenRouter, Anthropic…), each with its own settings and key; the
 * model module's MODEL_PROVIDER picks the one in use.
 */
export function piAiChatModel(instance: PiAiInstance): Provider<ChatModel> {
  const config = piAiConfig(instance);
  const { account } = instance;
  const model: ChatModel = {
    identity: () => ({ api: config.api, provider: config.baseUrl, model: config.model }),
    complete: (request) => complete(config, request),
    ...(account ? { balance: () => account.balance({ baseUrl: config.baseUrl, apiKey: config.apiKey, headers: config.extraHeaders }) } : {}),
  };
  return {
    id: instance.id,
    capability: chatModelCapability.id,
    config: chatModelSettings(instance),
    available: () => {
      if (!config.apiKey) return notReady(`还没填 ${instance.label} 的 API Key`);
      if (!config.baseUrl) return notReady(`还没填 ${instance.label} 的服务地址`);
      if (!config.model) return notReady(`还没填 ${instance.label} 的模型`);
      return READY;
    },
    create: () => model,
    billedTo: () => config.apiKey || undefined,
  };
}
