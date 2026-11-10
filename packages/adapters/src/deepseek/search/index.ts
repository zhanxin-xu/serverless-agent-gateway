/** DeepSeek's search and fetch APIs as a search provider. */
import { notReady, READY, searchCapability, type Provider, type SearchBackend } from "@gateway/core";
import { deepseekClient } from "./client.js";
import { deepseekConfig } from "./config.js";
import { CONFIG } from "./settings.js";

export const deepseekProvider: Provider<SearchBackend> = {
  id: "deepseek",
  capability: searchCapability.id,
  config: CONFIG,
  available: () => (deepseekConfig.apiKey ? READY : notReady("还没填 DeepSeek 搜索的 API Key")),
  create: () => deepseekClient,
  billedTo: () => deepseekConfig.apiKey || undefined,
};
