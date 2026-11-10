import { instanceSettings, settingInt, type ModelAccount } from "@gateway/core";
import { isProtocol, type Protocol } from "./protocols.js";

/** One chat model endpoint the deployment composes (piAiChatModel): what it is, and its defaults. */
export interface PiAiInstance {
  /** Unique among the chat model's providers; its settings are MODEL_{ID}_… */
  id: string;
  /** Its name in the console. */
  label: string;
  /** A line about it in the console. */
  help: string;
  /** The protocol it speaks by default. */
  api: Protocol;
  /** Its base URL by default; "" when it has none (the person fills it in). */
  baseUrl: string;
  /** Its model by default, if any. */
  model?: string;
  /** Reads what's left on its key (the service's own report), when the service has one. */
  account?: ModelAccount;
}

/** An instance's settings, read on every use, so the console's changes apply to the next call. */
export function piAiConfig(instance: PiAiInstance) {
  const s = instanceSettings("model", instance.id);
  return {
    key: s.key,
    get api(): Protocol {
      const api = s.value("api", instance.api);
      if (!isProtocol(api)) throw new Error(`${s.key("api")} 不支持 ${api}`);
      return api;
    },
    /** Without a trailing slash; pi-ai appends the protocol's path. */
    get baseUrl() {
      return s.value("base_url", instance.baseUrl).replace(/\/+$/, "");
    },
    get apiKey() {
      return s.value("api_key");
    },
    get model() {
      return s.value("model", instance.model ?? "");
    },
    get extraBody() {
      return s.json("extra_body");
    },
    get extraHeaders() {
      return s.json("extra_headers") as Record<string, string>;
    },
    /** Unset: undefined (only Anthropic, which requires a cap, gets a default). */
    get maxOutputTokens(): number | undefined {
      return s.value("max_output_tokens") ? s.int("max_output_tokens") : undefined;
    },
    /** USD per million tokens; unset counts as 0. */
    get prices() {
      const price = (field: string) => Number(s.value(field)) || 0;
      return { input: price("price_input"), cached: price("price_cached"), output: price("price_output") };
    },
    /** The agent's context budget (a core setting): how much of the model's window the gateway uses. */
    get contextTokens() {
      return settingInt("AGENT_CONTEXT_TOKENS");
    },
  };
}

export type PiAiConfig = ReturnType<typeof piAiConfig>;
