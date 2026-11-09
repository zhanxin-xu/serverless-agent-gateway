/** get_llm_key_limit: what's left on the chat model's key, when its provider can tell. */
import { select } from "../capability.js";
import type { Tool } from "../tool.js";
import type { Balance } from "../types.js";
import { chatModelCapability } from "./capability.js";

/** The model key's limit and spend; undefined when the provider in use can't tell. */
export function modelBalance(): Promise<Balance> | undefined {
  const selection = select(chatModelCapability);
  return selection.ok ? selection.provider.create().balance?.() : undefined;
}

export const llmKeyLimit: Tool = {
  name: "get_llm_key_limit",
  description:
    "Check the spending limit, remaining credit and usage (USD) of model_key, the API key that pays for you (the chat model), " +
    "as its service reports them.",
  parameters: { type: "object", properties: {} },
  enabled: () => {
    const selection = select(chatModelCapability);
    return selection.ok && Boolean(selection.provider.create().balance);
  },
  async run() {
    const balance = modelBalance();
    if (!balance) throw new Error("这个模型服务查不了额度");
    return JSON.stringify((await balance).report);
  },
};
