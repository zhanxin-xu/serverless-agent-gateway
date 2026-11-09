/**
 * The chat model's module: its settings (the agent loop in src/agent reads
 * them), a real test call, and what's left on its key. Nothing works without
 * it, so the setup guide asks for it first.
 */
import { createResponse, outputText } from "../../agent/model.js";
import { config } from "../../config.js";
import type { PromptSectionContext } from "../../prompt/types.js";
import { notReady, READY, type Module } from "../types.js";
import { CONFIG } from "./settings.js";
import { llmKeyLimit, modelBalance } from "./tools.js";

function guide(ctx: PromptSectionContext): string {
  if (!ctx.has(llmKeyLimit.name)) return "";
  return `# 查模型的账

有人问你还剩多少余额/额度/token，调 get_llm_key_limit 查聊天模型这个 key（平台余额 usage 与自带 Key 的 byok_usage 分开算），查完照实报数。`;
}

/** Called once by compose() (src/composition.ts), after every file has loaded and the persona is in place. */
export function modelModule(): Module {
  return {
    id: "model",
    label: "模型",
    summary: "聊天用的模型：服务地址、Key、单价，以及查这个 key 的额度和花费。",
    core: true,
    setup: "required",
    ready: () => (config.llm.apiKey ? READY : notReady("还没填模型的 API Key")),
    // The chat model's own settings (key, model, prices…) are configured on this module's page.
    config: CONFIG,
    tools: [llmKeyLimit],
    section: { order: 5100, text: guide },
    balance: modelBalance,
    async check() {
      if (!config.llm.apiKey) throw new Error("还没填 API Key");
      const response = await createResponse(
        { model: config.llm.model, ...config.llm.extraBody, instructions: "用不超过十个字打个招呼。", input: "你好" },
        { timeoutMs: 60_000 },
      );
      return `${config.llm.model} 回复：${outputText(response.output ?? []).trim() || "（空）"}`;
    },
  };
}
