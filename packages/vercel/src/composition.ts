/**
 * What the Vercel deployment is made of (Composition in @gateway/core): every module,
 * a provider for each capability (the chat model through pi-ai), QQ / Telegram / HTTP over webhooks,
 * Supabase as the store (memory until it's connected), 大肥鱼 as the persona,
 * and the console's Vercel-specific steps.
 */
import { basicsModule, chatModule, compose, imageModule, isComposed, memoryModule, MemoryStore, modelModule, sandboxModule, searchModule, voiceModule } from "@gateway/core";
import { deepseekProvider } from "@gateway/adapters/deepseek";
import { httpAdapter } from "@gateway/adapters/http";
import { openaiSpeechProvider } from "@gateway/adapters/openai-speech";
import { openrouterAccount, openrouterImagesProvider } from "@gateway/adapters/openrouter";
import { piAiChatModel, piAiConfig } from "@gateway/adapters/pi-ai";
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
      // The chat model's key is an OpenRouter key by default: OpenRouter tells what's left on it, and the
      // image provider may share it.
      piAiChatModel({ account: openrouterAccount }),
      deepseekProvider,
      upstashVectorProvider,
      vercelSandboxProvider,
      openrouterImagesProvider({ modelKey: () => piAiConfig.apiKey }),
      openaiSpeechProvider,
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
