import { instanceSettings } from "@gateway/core";

/** Its settings are SEARCH_DEEPSEEK_… */
export const SEARCH_DEEPSEEK = instanceSettings("search", "deepseek");

export const deepseekConfig = {
  get apiKey() {
    return SEARCH_DEEPSEEK.value("api_key");
  },
  get baseUrl() {
    return SEARCH_DEEPSEEK.value("base_url").replace(/\/+$/, "");
  },
};
