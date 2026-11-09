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
 * The core settings (channels, the agent, the console) are listed here; each
 * module declares its own and its providers' (Module.config, Provider.config),
 * collected from the module list. Collected on first use, not on import:
 * config.ts reads this, and modules read config.ts.
 */
import { loadedModules } from "../modules/index.js";
import type { Module } from "../modules/types.js";

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
  /** Chooses this capability's provider: an "enum" whose options are the providers (unset: the one configured). */
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
  /** Set by the catalog: the module this group configures, its own settings or (with `provider`) one of its providers'. */
  module?: string;
  /** Set by the catalog: a provider's settings, which capability it serves and its id there. */
  provider?: { capability: string; id: string };
  /** The few settings that turn it on, asked for in the setup guide (the rest are on the config page). */
  essentials?: string[];
}

const CORE_GROUPS: SettingGroup[] = [
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

const CORE_SETTINGS: SettingDef[] = [
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

/** The setting that turns an optional module on or off everywhere ("on" by default); core modules have none. */
export const switchSetting = (module: Module): string | undefined => (module.core ? undefined : `MODULE_${module.id.toUpperCase()}`);

/** An optional module's switch, added to its own group. */
const switchDef = (key: string, group: string): SettingDef => ({
  key,
  group,
  label: "开关",
  kind: "enum",
  default: "on",
  options: [
    { value: "on", label: "开" },
    { value: "off", label: "关" },
  ],
  help: "关掉后所有聊天都不提供这个模块；依赖它的模块也会跟着关。",
});

interface Catalog {
  groups: SettingGroup[];
  settings: SettingDef[];
  byKey: Map<string, SettingDef>;
}

let built: Catalog | undefined;

/** The core settings and every module's, in the order the console lists them: modules first, then the core groups. */
function catalog(): Catalog {
  if (built) return built;
  const groups: SettingGroup[] = [];
  const settings: SettingDef[] = [];
  for (const m of loadedModules()) {
    if (m.config) {
      groups.push({ ...m.config.group, module: m.id });
      settings.push(...m.config.settings);
    }
    const toggle = switchSetting(m);
    if (toggle) {
      if (!m.config) throw new Error(`module ${m.id} is optional, so it needs a settings group for its switch`);
      settings.push(switchDef(toggle, m.config.group.id));
    }
    for (const p of m.capability?.providers ?? []) {
      groups.push({ ...p.config.group, module: m.id, provider: { capability: m.capability!.id, id: p.id } });
      settings.push(...p.config.settings);
    }
  }
  groups.push(...CORE_GROUPS);
  settings.push(...CORE_SETTINGS);
  // A provider choice lists the capability's providers; unset, the one configured is used (src/modules/capability.ts).
  const withProviders = settings.map((def): SettingDef => {
    if (!def.capability) return def;
    const providers = groups.filter((g) => g.provider?.capability === def.capability);
    return { ...def, default: "", options: providers.map((g) => ({ value: g.provider!.id, label: g.label })) };
  });
  const byKey = new Map<string, SettingDef>();
  for (const def of withProviders) {
    if (byKey.has(def.key)) throw new Error(`setting ${def.key} is declared twice`);
    if (!groups.some((g) => g.id === def.group)) throw new Error(`setting ${def.key} is in group ${def.group}, which no module declares`);
    byKey.set(def.key, def);
  }
  built = { groups, settings: withProviders, byKey };
  return built;
}

/** Every settings group, in the console's order. */
export const settingGroups = (): SettingGroup[] => catalog().groups;

/** Every setting, in the console's order. */
export const settingDefs = (): SettingDef[] => catalog().settings;

export const settingDef = (key: string): SettingDef | undefined => catalog().byKey.get(key);

/** The default of a listed setting ("" when it has none or isn't listed). */
export const settingDefault = (key: string): string => catalog().byKey.get(key)?.default ?? "";

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
