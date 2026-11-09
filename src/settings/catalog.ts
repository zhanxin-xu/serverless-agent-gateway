/**
 * Every setting the admin console manages: one entry per environment
 * variable it stands in for, with its default, how to edit it and how to check
 * it. The single source of truth for defaults: config.ts reads them from here.
 *
 * Not listed, so never stored in the database: what the gateway needs before
 * it can reach the database (ADMIN_PASSWORD, SUPABASE_*, POSTGRES_*), what
 * Vercel sets (VERCEL_*), and AGENT_MAX_DURATION_SECONDS, which must match
 * vercel.json.
 *
 * Each module and provider keeps its own settings beside its code
 * (src/modules/<module>/settings.ts, src/modules/<module>/providers/<id>/settings.ts);
 * this file collects them after the core ones. Those files are pure data, like
 * this one: config.ts, the settings service and the console all read the
 * catalog, so it must not pull in code that reads config.
 */
import * as image from "../modules/image/settings.js";
import * as openrouterImages from "../modules/image/providers/openrouter-images/settings.js";
import * as memory from "../modules/memory/settings.js";
import * as upstashVector from "../modules/memory/providers/upstash-vector/settings.js";
import * as sandbox from "../modules/sandbox/settings.js";
import * as vercelSandbox from "../modules/sandbox/providers/vercel-sandbox/settings.js";
import * as search from "../modules/search/settings.js";
import * as deepseek from "../modules/search/providers/deepseek/settings.js";
import * as voice from "../modules/voice/settings.js";
import * as openaiSpeech from "../modules/voice/providers/openai-speech/settings.js";

export type SettingKind = "text" | "textarea" | "secret" | "url" | "int" | "number" | "json" | "enum";

export interface SettingOption {
  value: string;
  label: string;
}

export interface SettingDef {
  /** The environment variable this stands in for. */
  key: string;
  group: string;
  label: string;
  kind: SettingKind;
  /** Used when neither the database nor the environment has a value. */
  default?: string;
  help?: string;
  /** For "enum". */
  options?: SettingOption[];
  /** For "int" and "number": the smallest value accepted (int: 1 unless set). */
  min?: number;
  /** A secret the console can make up (a random token) instead of someone typing it. */
  generate?: true;
  /** Filled in by the channel's connect (ChannelAdapter.connect), not typed by hand. */
  setByConnect?: true;
  /** Chooses this capability's provider: an "enum" whose options are the providers (empty = automatic). */
  capability?: string;
}

export interface SettingGroup {
  id: string;
  label: string;
  help: string;
  /** The setting that turns the feature on when filled in. */
  enabledBy?: string;
  /** The channel (ChannelAdapter.name) these are the credentials of. */
  channel?: string;
  /** The module this group configures: its own settings, or (with `provider`) one of its providers'. */
  module?: string;
  /** A provider's settings: which capability it serves, and its id there. */
  provider?: { capability: string; id: string };
  /** The few settings that turn it on, asked for in the setup guide (the rest are on the config page). */
  essentials?: string[];
}

const OPENROUTER = "https://openrouter.ai/api/v1";

/** Modules and their providers, in the order the console lists them. */
const MODULE_SETTINGS = [image, openrouterImages, voice, openaiSpeech, search, deepseek, memory, upstashVector, sandbox, vercelSandbox];

const CORE_GROUPS: SettingGroup[] = [
  { id: "llm", label: "模型", help: "任何兼容 OpenAI Responses API 的服务（POST {服务地址}/responses），默认 OpenRouter。", enabledBy: "OPENAI_RESPONSES_API_KEY" },
  {
    id: "qq",
    label: "QQ",
    help: "QQ 开放平台的机器人。把下面的回调地址填进 QQ 开放平台；大陆的 QQ 服务器访问不了 *.vercel.app，必须先绑定自定义域名。",
    enabledBy: "QQ_APP_SECRET",
    channel: "qq",
  },
  { id: "telegram", label: "Telegram", help: "@BotFather 给的 token。保存后点“设置 Webhook”。", enabledBy: "TELEGRAM_BOT_TOKEN", channel: "telegram" },
  { id: "http", label: "HTTP", help: "通用 HTTP 接口：POST /api/webhook/http，带 Authorization: Bearer <token>。", enabledBy: "HTTP_CHANNEL_TOKEN", channel: "http" },
  { id: "agent", label: "Agent 参数", help: "步数、上下文、插话频率等。" },
  { id: "console", label: "管理", help: "管理端自己的设置。" },
];

export const SETTING_GROUPS: SettingGroup[] = [CORE_GROUPS[0]!, ...MODULE_SETTINGS.flatMap((m) => m.GROUPS), ...CORE_GROUPS.slice(1)];

const CORE_SETTINGS: SettingDef[] = [
  // ── Model ──
  { key: "OPENAI_RESPONSES_BASE_URL", group: "llm", label: "服务地址", kind: "url", default: OPENROUTER },
  { key: "OPENAI_RESPONSES_API_KEY", group: "llm", label: "API Key", kind: "secret" },
  { key: "OPENAI_RESPONSES_MODEL", group: "llm", label: "模型", kind: "text", default: "openai/gpt-6-luna" },
  {
    key: "OPENAI_RESPONSES_EXTRA_BODY",
    group: "llm",
    label: "额外请求参数",
    kind: "json",
    help: '合并进每次请求体，例如 {"provider":{"only":["openai"],"allow_fallbacks":false}}。不能覆盖 instructions、input、tools、tool_choice。',
  },
  { key: "OPENAI_RESPONSES_EXTRA_HEADERS", group: "llm", label: "额外请求头", kind: "json", help: '例如 {"X-Title":"my-bot"}' },
  { key: "OPENAI_RESPONSES_TIMEOUT_MS", group: "llm", label: "单次调用超时（毫秒）", kind: "int", default: "280000" },
  {
    key: "MODEL_PRICE_INPUT",
    group: "llm",
    label: "输入单价（美元 / 百万 token）",
    kind: "number",
    min: 0,
    help: "接口没返回花费时，用这三个单价估算每个群的花费（每群额度按它算）。OpenRouter 会返回花费，可以不填。",
  },
  { key: "MODEL_PRICE_CACHED", group: "llm", label: "缓存命中单价（美元 / 百万 token）", kind: "number", min: 0 },
  { key: "MODEL_PRICE_OUTPUT", group: "llm", label: "输出单价（美元 / 百万 token）", kind: "number", min: 0 },

  // ── Channels ──
  { key: "QQ_APP_ID", group: "qq", label: "AppID", kind: "text" },
  { key: "QQ_APP_SECRET", group: "qq", label: "AppSecret", kind: "secret" },
  { key: "TELEGRAM_BOT_TOKEN", group: "telegram", label: "Bot Token", kind: "secret" },
  { key: "TELEGRAM_WEBHOOK_SECRET", group: "telegram", label: "Webhook Secret", kind: "secret", help: "设置 Webhook 时自动生成。", setByConnect: true },
  {
    key: "TELEGRAM_BOT_USERNAME",
    group: "telegram",
    label: "机器人用户名",
    kind: "text",
    help: "不带 @。设置 Webhook 时自动填。填了以后群里只回 @ 它的消息。",
    setByConnect: true,
  },
  { key: "HTTP_CHANNEL_TOKEN", group: "http", label: "Bearer Token", kind: "secret", generate: true },

  // ── Agent ──
  { key: "AGENT_TIMEZONE", group: "agent", label: "时区", kind: "text", default: "Asia/Shanghai", help: "每条消息前的时间用这个时区。" },
  { key: "AGENT_MAX_STEPS", group: "agent", label: "每轮最多步数", kind: "int", default: "40" },
  { key: "AGENT_CONTEXT_TOKENS", group: "agent", label: "上下文预算（token）", kind: "int", default: "200000", help: "超过 80% 时压缩旧对话。" },
  {
    key: "AGENT_AMBIENT_INTERVAL_SECONDS",
    group: "agent",
    label: "插话频率（秒）",
    kind: "int",
    default: "10",
    min: 0,
    help: "群里没 @ 的消息，每个群每这么多秒最多给模型看一次，由它决定插不插话。0 = 从不插话。每个群可以单独改。",
  },
  { key: "STICKER_BASE_URL", group: "agent", label: "表情包地址", kind: "url", help: "留空用内置的梗鲸表情包 CDN。" },

  // ── Console ──
  {
    key: "CHAT_DEFAULT_MODE",
    group: "console",
    label: "新聊天的回复方式",
    kind: "enum",
    default: "normal",
    options: [
      { value: "normal", label: "正常" },
      { value: "mention", label: "只回 @" },
      { value: "record", label: "只记录" },
      { value: "block", label: "屏蔽" },
    ],
    help: "第一次出现的群和私聊按这个处理，可以在聊天页里单独改。",
  },
  { key: "WORKER_SECRET", group: "console", label: "Worker 签名密钥", kind: "secret", help: "一轮跑不完交给新函数时用来签名。留空时由其他密钥拼出来。", generate: true },
];

/** A provider choice lists the capability's providers, after "automatic". */
function withProviderOptions(def: SettingDef): SettingDef {
  if (!def.capability) return def;
  const providers = SETTING_GROUPS.filter((g) => g.provider?.capability === def.capability);
  return {
    ...def,
    default: "",
    options: [{ value: "", label: "自动（只有一个可用时用它）" }, ...providers.map((g) => ({ value: g.provider!.id, label: g.label }))],
  };
}

export const SETTINGS: SettingDef[] = [...CORE_SETTINGS, ...MODULE_SETTINGS.flatMap((m) => m.SETTINGS)].map(withProviderOptions);

const byKey = new Map(SETTINGS.map((d) => [d.key, d]));

export const settingDef = (key: string): SettingDef | undefined => byKey.get(key);

/** The default of a listed setting ("" when it has none or isn't listed). */
export const settingDefault = (key: string): string => byKey.get(key)?.default ?? "";

/**
 * Check a value typed into the console and return it normalized. An empty
 * value is valid for every kind: it clears the setting.
 */
export function validateSetting(def: SettingDef, raw: string): { value: string } | { error: string } {
  const value = def.kind === "textarea" || def.kind === "json" ? raw.trim() : raw.trim().replace(/\s*\n\s*/g, "");
  if (!value) return { value: "" };
  switch (def.kind) {
    case "url":
      return /^https?:\/\/[^\s/]+/i.test(value) ? { value: value.replace(/\/+$/, "") } : { error: "要以 http:// 或 https:// 开头" };
    case "int": {
      const min = def.min ?? 1;
      return /^\d+$/.test(value) && Number(value) >= min ? { value: String(Number(value)) } : { error: `要填不小于 ${min} 的整数` };
    }
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) && n >= (def.min ?? 0) ? { value: String(n) } : { error: `要填不小于 ${def.min ?? 0} 的数字` };
    }
    case "json": {
      try {
        const parsed: unknown = JSON.parse(value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "要填一个 JSON 对象，例如 {\"a\":1}" };
        return { value: JSON.stringify(parsed) };
      } catch (err) {
        return { error: `不是合法的 JSON：${err instanceof Error ? err.message : String(err)}` };
      }
    }
    case "enum":
      return def.options?.some((o) => o.value === value) ? { value } : { error: `只能是 ${def.options?.map((o) => o.value || "（空）").join("、")}` };
    default:
      return { value };
  }
}
