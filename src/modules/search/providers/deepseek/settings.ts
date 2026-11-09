// Settings of the DeepSeek search provider (pure data: src/settings/catalog.ts collects them).
import type { SettingDef, SettingGroup } from "../../../../settings/catalog.js";

export const GROUPS: SettingGroup[] = [
  {
    id: "search.deepseek",
    label: "DeepSeek",
    help: "DeepSeek 的搜索和网页抓取接口，每千次成功调用约 ¥5，能查余额。",
    enabledBy: "DEEPSEEK_API_KEY",
    module: "search",
    provider: { capability: "search", id: "deepseek" },
  },
];

export const SETTINGS: SettingDef[] = [
  { key: "DEEPSEEK_API_KEY", group: "search.deepseek", label: "DeepSeek API Key", kind: "secret" },
  { key: "DEEPSEEK_BASE_URL", group: "search.deepseek", label: "服务地址", kind: "url", default: "https://api.deepseek.com" },
];
