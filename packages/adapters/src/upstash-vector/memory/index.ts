/** Upstash Vector as the memory store. */
import { memoryCapability, notReady, READY, type Provider, type VectorMemory } from "@gateway/core";
import { upstashVectorClient } from "./client.js";
import { upstashConfig } from "./config.js";
import { CONFIG } from "./settings.js";

export const upstashVectorProvider: Provider<VectorMemory> = {
  id: "upstash",
  capability: memoryCapability.id,
  config: CONFIG,
  available: () => (upstashConfig.url && upstashConfig.token ? READY : notReady("还没填 Upstash Vector 的 REST URL 和 Token")),
  create: () => upstashVectorClient,
};
