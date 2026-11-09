/**
 * What the local Node deployment is made of (src/composition.ts): the same
 * modules, providers and persona as on Vercel, a long-running host, and
 * Supabase when SUPABASE_URL is set (memory otherwise).
 *
 * Channels arrive over webhooks, so the platform must reach this server: run
 * it behind a public address or a tunnel (cloudflared, ngrok). The HTTP
 * channel works locally as is.
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
import { nodeHost } from "./host.js";

export function composeNode(): void {
  if (isComposed()) return;
  compose({
    host: nodeHost,
    persona: dafeiyu,
    modules: [chatModule, basicsModule, modelModule, memoryModule, searchModule, sandboxModule, imageModule, voiceModule],
    providers: [deepseekProvider, upstashVectorProvider, vercelSandboxProvider, openrouterImagesProvider, openaiSpeechProvider],
    modelAccount: openrouterAccount,
    channels: [qqAdapter, telegramAdapter, httpAdapter],
    store: () => (supabaseConfig.configured ? new PostgresStore(supabaseConfig.url, supabaseConfig.key) : new MemoryStore()),
    database: supabaseDatabase,
    guide: {
      label: "本地 Node 服务",
      password: [
        "在项目根目录的 .env.local 里加一行 ADMIN_PASSWORD=一个足够长的密码。",
        "重启服务（npm run dev 会自动重启），然后刷新这个页面。",
      ],
      changePassword: "要换密码：改 .env.local 里的 ADMIN_PASSWORD 并重启服务，已存的配置不受影响。",
      database: {
        intro: "聊天记录、设置和密钥可以存在 Supabase（免费版就够）。现在没连上，数据只在这个进程的内存里，重启就没了。",
        steps: [
          "在 supabase.com 新建一个项目。",
          "在 .env.local 里填 SUPABASE_URL 和 SUPABASE_SECRET_KEY；想让管理端自动建表，再填数据库直连地址 POSTGRES_URL_NON_POOLING。",
          "重启服务，然后回到这一步。",
        ],
      },
    },
  });
}
