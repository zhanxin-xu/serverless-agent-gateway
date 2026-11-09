/**
 * The chat model's module: which provider serves the model (each brings its
 * own endpoint, key and model settings), a real test call, and what's left on
 * its key. Nothing works without it, so the setup guide asks for it first.
 */
import { messageText } from "../../llm/content.js";
import type { PromptSectionContext } from "../../prompt/types.js";
import { use } from "../capability.js";
import type { Module } from "../types.js";
import { chatModelCapability } from "./capability.js";
import { CONFIG } from "./settings.js";
import { llmKeyLimit, modelBalance } from "./tools.js";

function guide(ctx: PromptSectionContext): string {
  if (!ctx.has(llmKeyLimit.name)) return "";
  return `# 查模型的账

有人问你还剩多少余额/额度/token，调 ${llmKeyLimit.name} 查聊天模型这个 key，查完照实报数。`;
}

/** Called once by compose() (src/composition.ts), after every file has loaded and the persona is in place. */
export function modelModule(): Module {
  return {
    id: "model",
    label: "模型",
    summary: "聊天用的模型：用哪个服务、哪个模型，以及查这个 key 的额度和花费。",
    core: true,
    setup: "required",
    capability: chatModelCapability,
    config: CONFIG,
    tools: [llmKeyLimit],
    section: { order: 5100, text: guide },
    balance: modelBalance,
    async check() {
      const model = use(chatModelCapability);
      const reply = await model.complete({
        systemPrompt: "用不超过十个字打个招呼。",
        messages: [{ role: "user", content: "你好", timestamp: Date.now() }],
        tools: [],
        toolChoice: "none",
        timeoutMs: 60_000,
      });
      return `${model.identity().model} 回复：${messageText(reply) || "（空）"}`;
    },
  };
}
