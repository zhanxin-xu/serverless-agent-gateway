/** get_llm_key_limit: what's left on the chat model's key, as the deployment's ModelAccount reads it (src/composition.ts). */
import { modelAccount } from "../../composition.js";
import { config } from "../../config.js";
import type { Balance } from "../types.js";
import type { Tool } from "../tool.js";

/** The model key's limit and spend; undefined when the deployment can't tell. */
export function modelBalance(): Promise<Balance> | undefined {
  const account = modelAccount();
  const { apiKey, baseUrl, extraHeaders } = config.llm;
  if (!account || !apiKey) return undefined;
  return account.balance({ baseUrl, apiKey, headers: extraHeaders });
}

export const llmKeyLimit: Tool = {
  name: "get_llm_key_limit",
  description:
    "Check the spending limit, remaining credit and usage (today / this week / this month / all time, USD) of model_key, " +
    "the API key that pays for you (the chat model). " +
    "Spend is split into platform credits (usage) and your own provider keys (byok_usage); a budget may count both.",
  parameters: { type: "object", properties: {} },
  enabled: () => Boolean(config.llm.apiKey && modelAccount()),
  async run() {
    const balance = modelBalance();
    if (!balance) throw new Error("这个部署查不了模型的额度");
    return JSON.stringify((await balance).report);
  },
};
