/** The chat model: the interface every model provider implements, and the providers. */
import type { AssistantMessage, LlmRequest, ModelIdentity } from "../../llm/types.js";
import { providersOf, select } from "../capability.js";
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
};

/**
 * Reads what's left on a model key from the service that issued it (OpenRouter's /key…).
 * A provider that talks to such a service takes one to answer ChatModel.balance.
 */
export interface ModelAccount {
  balance(key: { baseUrl: string; apiKey: string; headers: Record<string, string> }): Promise<Balance>;
}

/** The identity calls go to now; undefined while no provider is usable. */
export function currentModelIdentity(): ModelIdentity | undefined {
  const selection = select(chatModelCapability);
  return selection.ok ? selection.provider.create().identity() : undefined;
}
