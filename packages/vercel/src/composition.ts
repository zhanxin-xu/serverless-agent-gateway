/**
 * What the Vercel deployment is made of (Composition in @gateway/core): every module,
 * providers for each capability (the chat model through pi-ai, one per endpoint), QQ / Telegram / HTTP over webhooks,
 * Supabase as the store (memory until it's connected), 大肥鱼 as the persona,
 * and the console's Vercel-specific steps.
 */
import { basicsModule, chatModule, compose, imageModule, isComposed, memoryModule, MemoryStore, modelModule, sandboxModule, searchModule, voiceModule } from "@gateway/core";
import { deepseekProvider } from "@gateway/adapters/deepseek";
import { httpAdapter } from "@gateway/adapters/http";
import { openaiSpeechProvider } from "@gateway/adapters/openai-speech";
import { openrouterAccount, openrouterImagesProvider } from "@gateway/adapters/openrouter";
import { piAiChatModel } from "@gateway/adapters/pi-ai";
import { qqAdapter } from "@gateway/adapters/qq";
import { PostgresStore, supabaseConfig, supabaseDatabase } from "@gateway/adapters/supabase";
import { telegramAdapter } from "@gateway/adapters/telegram";
import { upstashVectorProvider } from "@gateway/adapters/upstash-vector";
import { vercelSandboxProvider } from "@gateway/adapters/vercel-sandbox";
import { fileURLToPath } from "node:url";
import { dafeiyu } from "./personas/dafeiyu/index.js";
import { vercelHost } from "./host.js";

/** Compose the gateway for Vercel; each entry (api/*.ts) calls it first, and only the first call counts. */
export function composeVercel(): void {
  if (isComposed()) return;
  compose({
    // This package's directory: the persona's picture and voice are in its assets/ (vercel.json ships them).
    baseDir: fileURLToPath(new URL("..", import.meta.url)),
    host: vercelHost,
    persona: dafeiyu,
    modules: [chatModule, basicsModule, modelModule, memoryModule, searchModule, sandboxModule, imageModule, voiceModule],
    providers: [
      // The chat model: one provider per endpoint, each with its own key; MODEL_PROVIDER picks one
      // (unset: the one that's configured). OpenRouter reports what's left on its key.
      piAiChatModel({
        id: "openrouter",
        label: "OpenRouter",
        help: "OpenRouter，默认用它的 Responses 接口，一个 Key 用各家模型，能查 Key 的额度。",
        api: "openai-responses",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "openai/gpt-6-luna",
        account: openrouterAccount,
      }),
      piAiChatModel({ id: "openai", label: "OpenAI", help: "OpenAI 官方，Responses 接口。", api: "openai-responses", baseUrl: "https://api.openai.com/v1" }),
      piAiChatModel({ id: "anthropic", label: "Anthropic", help: "Anthropic 官方，Messages 接口。", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" }),
      piAiChatModel({
        id: "gemini",
        label: "Google Gemini",
        help: "Google AI Studio 的 Gemini 接口。",
        api: "google-generative-ai",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      }),
      piAiChatModel({ id: "deepseek", label: "DeepSeek", help: "DeepSeek 官方，Chat Completions 接口。", api: "openai-completions", baseUrl: "https://api.deepseek.com" }),
      piAiChatModel({ id: "custom", label: "自定义", help: "任何兼容四种协议之一的服务：选协议、填服务地址。", api: "openai-completions", baseUrl: "" }),
      deepseekProvider,
      upstashVectorProvider,
      vercelSandboxProvider,
      openrouterImagesProvider,
      openaiSpeechProvider({
        id: "openrouter",
        label: "OpenRouter",
        help: "OpenRouter 的语音接口（POST /audio/speech），默认克隆人设自己的声音。支持 Fish Audio 和 ByteDance Seed 两类模型的写法。",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "fish-audio/drama-3",
      }),
    ],
    channels: [qqAdapter, telegramAdapter, httpAdapter],
    store: () => (supabaseConfig.configured ? new PostgresStore(supabaseConfig.url, supabaseConfig.key) : new MemoryStore()),
    database: supabaseDatabase,
    guide: {
      password: [
        "打开 Vercel 项目的 Settings → Environment Variables。",
        "添加 ADMIN_PASSWORD，值是一个足够长的密码。",
        "在 Deployments 页面对最新部署点 Redeploy，然后刷新这个页面。",
      ],
      changePassword: "要换密码：在 Vercel 改 ADMIN_PASSWORD 并重新部署，用新密码登录就行，已存的配置不受影响。",
      database: {
        intro: "聊天记录、设置和密钥都存在 Supabase（免费版就够）。现在还没连上，数据只在这个实例的内存里，重启就没了。",
        steps: [
          "打开 Vercel 项目的 Storage 页面，添加 Supabase：套餐选 Free，区域选 Singapore。",
          "把它连接到这个项目，Vercel 会自动注入 SUPABASE_URL、SUPABASE_SECRET_KEY 和数据库直连地址。",
          "在 Deployments 页面 Redeploy，然后回到这一步。",
        ],
      },
    },
  });
}
