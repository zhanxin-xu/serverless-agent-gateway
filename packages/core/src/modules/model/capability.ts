/** The chat model: the interface every model provider implements, and the providers. */
import type { AssistantMessage, LlmRequest, ModelIdentity } from "../../llm/types.js";
import { costOf } from "../../pricing/cost.js";
import { providersOf } from "../capability.js";
import type { Balance, Capability } from "../types.js";

/**
 * A chat model. A failed call throws ModelCallError (src/llm/errors.ts):
 * OutOfCreditError when the key has no money left, `transient` when the same
 * request may well succeed later.
 *
 * Its answer reports the tokens it used, and the cost only when the service
 * billed it (Usage.totalFromProvider); the core prices the rest (priced below).
 */
export interface ChatModel {
  /** Where calls go now; what the next assistant message will record. */
  identity(): ModelIdentity;
  complete(request: LlmRequest): Promise<AssistantMessage>;
  /** What's left on the key, when the service can tell. */
  balance?(): Promise<Balance>;
}

export const chatModelCapability: Capability<ChatModel> = {
  id: "chat-model",
  label: "聊天模型",
  selectionSetting: "MODEL_PROVIDER",
  // Whatever the deployment composed for it (src/composition.ts).
  get providers() {
    return providersOf<ChatModel>(this.id);
  },
  // Each answer leaves priced: the service's bill, else its tokens by the price table.
  meter: (model, gate) => ({
    identity: () => model.identity(),
    ...(model.balance ? { balance: () => model.balance!() } : {}),
    async complete(request) {
      await gate.check();
      const started = Date.now();
      const message = priced(await model.complete(request), started);
      await gate.record(message.usage.cost.total);
      return message;
    },
  }),
};

/** The answer with its cost: as billed, or its tokens priced by the table (src/pricing/). */
export function priced(message: AssistantMessage, at: number): AssistantMessage {
  const { usage } = message;
  if (usage.cost.totalFromProvider) return message;
  const cost = costOf(
    { model: message.model, tokens: { input: usage.input, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, reasoning: usage.reasoning } },
    at,
  );
  const { by: _by, entry, tier: _tier, ...parts } = cost;
  return { ...message, usage: { ...usage, cost: { ...parts, ...(entry ? { priceEntry: entry } : {}) } } };
}

/**
 * Reads what's left on a model key from the service that issued it (OpenRouter's /key…).
 * A provider that talks to such a service takes one to answer ChatModel.balance.
 */
export interface ModelAccount {
  balance(key: { baseUrl: string; apiKey: string; headers: Record<string, string> }): Promise<Balance>;
}
