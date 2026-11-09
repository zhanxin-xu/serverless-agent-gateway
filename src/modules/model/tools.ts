/** get_llm_key_limit: what's left on the chat model's key (OpenRouter's GET /key). */
import { config } from "../../config.js";
import { keyBalance, keyReport } from "../shared/openrouter-key.js";
import type { Balance } from "../types.js";
import type { Tool } from "../tool.js";

/** The model key's limit and spend. */
export async function modelBalance(): Promise<Balance> {
  const { apiKey, baseUrl, extraHeaders } = config.llm;
  if (!apiKey) throw new Error("还没填模型的 API Key");
  return keyBalance("model_key", await keyReport(baseUrl, apiKey, extraHeaders));
}

export const llmKeyLimit: Tool = {
  name: "get_llm_key_limit",
  description:
    "Check the spending limit, remaining credit and usage (today / this week / this month / all time, USD) of model_key, " +
    "the API key that pays for you (the chat model). " +
    "Spend is split into OpenRouter credits (usage) and your own provider keys (byok_usage); a budget may count both.",
  parameters: { type: "object", properties: {} },
  enabled: () => Boolean(config.llm.apiKey),
  async run() {
    return JSON.stringify((await modelBalance()).report);
  },
};
