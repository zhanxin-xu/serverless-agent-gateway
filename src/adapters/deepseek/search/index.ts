/** DeepSeek's search and fetch APIs as a search provider. */
import type { Provider } from "../../../modules/types.js";
import { notReady, READY } from "../../../modules/types.js";
import { searchCapability, type SearchBackend } from "../../../modules/search/capability.js";
import { deepseekClient } from "./client.js";
import { deepseekConfig } from "./config.js";
import { CONFIG } from "./settings.js";

export const deepseekProvider: Provider<SearchBackend> = {
  id: "deepseek",
  capability: searchCapability.id,
  config: CONFIG,
  available: () => (deepseekConfig.apiKey ? READY : notReady("还没填 DeepSeek API Key")),
  create: () => deepseekClient,
};
