/**
 * What the Vercel deployment is made of (src/composition.ts): every module,
 * a provider for each capability, QQ / Telegram / HTTP over webhooks,
 * Supabase as the store (memory until it's connected), 大肥鱼 as the persona,
 * and the console's Vercel-specific steps.
 */
import { compose, isComposed } from "../../src/composition.js";
import { basicsModule, chatModule, imageModule, memoryModule, modelModule, sandboxModule, searchModule, voiceModule } from "../../src/modules/index.js";
import { MemoryStore } from "../../src/store/index.js";
import { deepseekProvider } from "../../src/adapters/deepseek/index.js";
import { httpAdapter } from "../../src/adapters/http/index.js";
import { openaiSpeechProvider } from "../../src/adapters/openai-speech/index.js";
import { openrouterAccount, openrouterImagesProvider } from "../../src/adapters/openrouter/index.js";
import { qqAdapter } from "../../src/adapters/qq/index.js";
import { PostgresStore, supabaseConfig, supabaseDatabase } from "../../src/adapters/supabase/index.js";
import { telegramAdapter } from "../../src/adapters/telegram/index.js";
import { upstashVectorProvider } from "../../src/adapters/upstash-vector/index.js";
import { vercelSandboxProvider } from "../../src/adapters/vercel-sandbox/index.js";
import { dafeiyu } from "../../src/personas/dafeiyu/index.js";
import { vercelHost } from "./host.js";

/** Compose the gateway for Vercel; each entry (api/*.ts) calls it first, and only the first call counts. */
export function composeVercel(): void {
  if (isComposed()) return;
  compose({
    host: vercelHost,
    persona: dafeiyu,
    modules: [chatModule, basicsModule, modelModule, memoryModule, searchModule, sandboxModule, imageModule, voiceModule],
    providers: [deepseekProvider, upstashVectorProvider, vercelSandboxProvider, openrouterImagesProvider, openaiSpeechProvider],
    modelAccount: openrouterAccount,
    channels: [qqAdapter, telegramAdapter, httpAdapter],
    store: () => (supabaseConfig.configured ? new PostgresStore(supabaseConfig.url, supabaseConfig.key) : new MemoryStore()),
    database: supabaseDatabase,
    guide: {
      label: "Vercel",
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
