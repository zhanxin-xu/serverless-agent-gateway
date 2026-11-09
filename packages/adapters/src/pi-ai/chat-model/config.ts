import { settingInt, settingJson, settingValue } from "@gateway/core";
import { isProtocol, type Protocol } from "./protocols.js";

/** The chat model through pi-ai. Read on every use, so the console's changes apply to the next call. */
export const piAiConfig = {
  get api(): Protocol {
    const api = settingValue("MODEL_API");
    if (!isProtocol(api)) throw new Error(`MODEL_API 不支持 ${api}`);
    return api;
  },
  /** Without a trailing slash; pi-ai appends the protocol's path. */
  get baseUrl() {
    return settingValue("MODEL_BASE_URL").replace(/\/+$/, "");
  },
  get apiKey() {
    return settingValue("MODEL_API_KEY");
  },
  get model() {
    return settingValue("MODEL_ID");
  },
  get extraBody() {
    return settingJson("MODEL_EXTRA_BODY");
  },
  get extraHeaders() {
    return settingJson("MODEL_EXTRA_HEADERS") as Record<string, string>;
  },
  /** Unset: undefined (only Anthropic, which requires a cap, gets a default). */
  get maxOutputTokens(): number | undefined {
    return settingValue("MODEL_MAX_OUTPUT_TOKENS") ? settingInt("MODEL_MAX_OUTPUT_TOKENS") : undefined;
  },
  /** USD per million tokens; unset counts as 0. */
  get prices() {
    const price = (name: string) => Number(settingValue(name)) || 0;
    return { input: price("MODEL_PRICE_INPUT"), cached: price("MODEL_PRICE_CACHED"), output: price("MODEL_PRICE_OUTPUT") };
  },
  /** The agent's context budget (a core setting): how much of the model's window the gateway uses. */
  get contextTokens() {
    return settingInt("AGENT_CONTEXT_TOKENS");
  },
};
