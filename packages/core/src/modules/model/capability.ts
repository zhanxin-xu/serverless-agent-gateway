/** The chat model: the interface every model provider implements, and the providers. */
import type { AssistantMessage, LlmRequest, ModelIdentity } from "../../llm/types.js";
import { providersOf } from "../capability.js";
import type { Balance, Capability } from "../types.js";

/**
 * A chat model. A failed call throws ModelCallError (src/llm/errors.ts):
 * OutOfCreditError when the key has no money left, `transient` when the same
 * request may well succeed later.
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
  // What a call cost: the provider's bill where it reports one, else its estimate from the model's prices.
  meter: (model, gate) => ({
    identity: () => model.identity(),
    ...(model.balance ? { balance: () => model.balance!() } : {}),
    async complete(request) {
      await gate.check();
      const message = await model.complete(request);
      await gate.record(message.usage.cost.total);
      return message;
    },
  }),
};

/**
 * Reads what's left on a model key from the service that issued it (OpenRouter's /key…).
 * A provider that talks to such a service takes one to answer ChatModel.balance.
 */
export interface ModelAccount {
  balance(key: { baseUrl: string; apiKey: string; headers: Record<string, string> }): Promise<Balance>;
}
