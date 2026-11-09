/** DeepSeek's search and fetch APIs as a search provider. */
import type { Provider } from "../../../types.js";
import { notReady, READY } from "../../../types.js";
import type { SearchBackend } from "../../capability.js";
import { deepseekClient } from "./client.js";
import { deepseekConfig } from "./config.js";
import { CONFIG } from "./settings.js";

export const deepseekProvider: Provider<SearchBackend> = {
  id: "deepseek",
  config: CONFIG,
  available: () => (deepseekConfig.apiKey ? READY : notReady("还没填 DeepSeek API Key")),
  create: () => deepseekClient,
};
