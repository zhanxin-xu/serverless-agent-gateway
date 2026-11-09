/**
 * Runtime configuration. Each setting is read on every access (so tests, the
 * local dev server and the admin console can change it) from, in order:
 *   1. the admin console (src/settings: stored in the database, loaded by
 *      refreshSettings at the start of each request),
 *   2. the environment variable of the same name,
 *   3. the default in src/settings/catalog.ts.
 * Bootstrap values the gateway needs before it can reach the database come
 * from the environment only (`env`).
 *
 * This holds the core: the model, chats, the agent. Every adapter (a
 * provider, a channel, the store) and the host read their own settings
 * (src/adapters/<x>/config.ts, deploy/<target>/) with the readers exported below.
 */
import { settingDefault } from "./settings/catalog.js";
import { overrideOf } from "./settings/overrides.js";

/** A setting's own value, before defaults: the console's, else the environment's. */
function raw(name: string): string | undefined {
  return overrideOf(name) ?? process.env[name];
}

/** A setting's value in effect: the console's, else the environment's, else the catalog default. */
export function settingValue(name: string, fallback = settingDefault(name)): string {
  return str(name, fallback);
}

/** A positive integer setting; the catalog default when unset or not a positive integer. */
export function settingInt(name: string): number {
  return int(name);
}

/** A setting holding a JSON object ({} when unset); throws on malformed JSON. */
export function settingJson(name: string): Record<string, unknown> {
  return jsonObject(name);
}

/** An environment-only value (never set from the console). */
export function envValue(name: string): string {
  return env(name);
}

function str(name: string, fallback = settingDefault(name)): string {
  return raw(name)?.trim() || fallback;
}

function int(name: string, fallback = Number.parseInt(settingDefault(name), 10)): number {
  const n = Number.parseInt(raw(name) ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** An environment-only value (never set from the console). */
function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** Parse a setting holding a JSON object; fail loudly on malformed config. */
function jsonObject(name: string): Record<string, unknown> {
  const raw = str(name);
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${name} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

/** What the environment says for a setting, ignoring the console: "" when unset. */
export function environmentValue(name: string): string {
  return env(name);
}

export const config = {
  /** The admin console (/admin). Environment only: the password that signs in to it. */
  admin: {
    get password() {
      return env("ADMIN_PASSWORD");
    },
  },

  /** How chats are handled by default (each chat can differ, src/chats/profile.ts). */
  chats: {
    /** normal | mention | record | block, for chats without their own setting. */
    get defaultMode() {
      return str("CHAT_DEFAULT_MODE");
    },
  },

  /** Any server that speaks the OpenAI Responses API (POST {baseUrl}/responses). Defaults to OpenRouter. */
  llm: {
    get apiKey() {
      return str("OPENAI_RESPONSES_API_KEY");
    },
    /** Any Responses-API-compatible base URL; `/responses` is appended. */
    get baseUrl() {
      return str("OPENAI_RESPONSES_BASE_URL").replace(/\/+$/, "");
    },
    get model() {
      return str("OPENAI_RESPONSES_MODEL");
    },
    /**
     * Extra fields merged into every Responses API request body (snake_case,
     * sent as-is), e.g. OpenRouter provider locking:
     *   {"provider":{"only":["openai"],"allow_fallbacks":false}}
     * Cannot override instructions / input / tools / tool_choice.
     */
    get extraBody() {
      return jsonObject("OPENAI_RESPONSES_EXTRA_BODY");
    },
    /** Extra request headers, e.g. {"HTTP-Referer":"https://example.com","X-Title":"my-bot"}. */
    get extraHeaders() {
      return jsonObject("OPENAI_RESPONSES_EXTRA_HEADERS") as Record<string, string>;
    },
    /**
     * Upper bound for one model call. Inside a run a call also ends when the
     * host's time budget does (agent/budget.ts), whichever comes first.
     */
    get timeoutMs() {
      return int("OPENAI_RESPONSES_TIMEOUT_MS");
    },
    /**
     * USD per million tokens, to estimate what a turn cost when the API doesn't
     * report it (OpenRouter does). Unset prices count as 0.
     */
    get prices() {
      const price = (name: string) => Number(str(name)) || 0;
      return { input: price("MODEL_PRICE_INPUT"), cached: price("MODEL_PRICE_CACHED"), output: price("MODEL_PRICE_OUTPUT") };
    },
  },

  // The system prompt is put together in src/prompt.
  agent: {
    /** Time zone of the time stamp prepended to each user message. */
    get timezone() {
      return str("AGENT_TIMEZONE");
    },
    /** Max model calls per turn, ambient or not (tool round-trips included). An ambient run that stays silent uses one. */
    get maxSteps() {
      return int("AGENT_MAX_STEPS");
    },
    /**
     * The context budget in tokens. When a request's input passes 80% of it,
     * the older part of the conversation is summarized (see compaction.ts).
     */
    get contextTokens() {
      return int("AGENT_CONTEXT_TOKENS");
    },
    /**
     * Ordinary (non-@) group messages are always recorded; at most one per this
     * many seconds per group is shown to the agent, which decides whether to chime
     * in. 0 = record only, never trigger the agent.
     */
    get ambientIntervalSeconds() {
      const n = Number.parseInt(raw("AGENT_AMBIENT_INTERVAL_SECONDS") ?? "", 10);
      return Number.isFinite(n) && n >= 0 ? n : Number(settingDefault("AGENT_AMBIENT_INTERVAL_SECONDS"));
    },
  },
};
