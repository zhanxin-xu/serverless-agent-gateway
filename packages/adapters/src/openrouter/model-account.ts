/** OpenRouter as the chat model's account: its GET /key report (the model module's get_llm_key_limit). */
import type { ModelAccount } from "@gateway/core";
import { keyBalance, keyReport } from "./key.js";

export const openrouterAccount: ModelAccount = {
  balance: async ({ baseUrl, apiKey, headers }) => keyBalance("model_key", await keyReport(baseUrl, apiKey, headers)),
};
