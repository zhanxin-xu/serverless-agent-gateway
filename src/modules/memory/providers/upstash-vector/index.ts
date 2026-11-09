/** Upstash Vector as the memory store. */
import type { Provider } from "../../../types.js";
import { notReady, READY } from "../../../types.js";
import type { VectorMemory } from "../../capability.js";
import { upstashVectorClient } from "./client.js";
import { upstashConfig } from "./config.js";
import { CONFIG } from "./settings.js";

export const upstashVectorProvider: Provider<VectorMemory> = {
  id: "upstash-vector",
  config: CONFIG,
  available: () => (upstashConfig.url && upstashConfig.token ? READY : notReady("还没填 Upstash Vector 的 REST URL 和 Token")),
  create: () => upstashVectorClient,
};
