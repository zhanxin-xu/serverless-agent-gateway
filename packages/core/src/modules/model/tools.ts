/** get_llm_key_limit: what's left on the chat model's key, when its provider can tell. */
import { balanceReport, canReportBalance, capabilityBalance } from "../balance.js";
import type { Tool } from "../tool.js";
import { chatModelCapability } from "./capability.js";

/** The model key's limit and spend; undefined when the provider in use can't tell. */
export const modelBalance = () => capabilityBalance(chatModelCapability);

export const llmKeyLimit: Tool = {
  name: "get_llm_key_limit",
  description:
    "Check the spending limit, remaining credit and usage (USD) of model_key, the API key that pays for you (the chat model), " +
    "as its service reports them. If another of your tools spends from the same key, it says so.",
  parameters: { type: "object", properties: {} },
  enabled: () => canReportBalance(chatModelCapability),
  run: () => balanceReport("model"),
};
