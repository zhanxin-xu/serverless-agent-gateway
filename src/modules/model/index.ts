/**
 * The chat model's own module: what's left on its key. The model itself (the
 * Responses API) is the core of the gateway (src/agent), not a module.
 */
import { config } from "../../config.js";
import { ORDER } from "../../prompt/order.js";
import type { PromptSectionContext } from "../../prompt/types.js";
import type { Module } from "../types.js";
import { llmKeyLimit, modelBalance } from "./tools.js";

function guide(ctx: PromptSectionContext): string {
  if (!ctx.has(llmKeyLimit.name)) return "";
  return `# 查模型的账

有人问你还剩多少余额/额度/token/白饭，调 get_llm_key_limit 查聊天模型这个 key（平台余额 usage 与自带 Key 的 byok_usage 分开算），查完照实报数，顺便吐槽还够吃几顿白饭。`;
}

export const modelModule: Module = {
  id: "model",
  label: "模型",
  summary: "查聊天模型 key 的额度和花费。每个聊天都有。",
  core: true,
  // The chat model's own settings (key, model, prices…) are configured on this module's page.
  settings: "llm",
  tools: [llmKeyLimit],
  section: { order: ORDER.module.model, text: guide },
  balance: () => (config.llm.apiKey ? modelBalance() : undefined),
};
