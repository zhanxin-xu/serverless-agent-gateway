// The search module's own settings (pure data: src/settings/catalog.ts collects them).
import type { SettingDef, SettingGroup } from "../../settings/catalog.js";

export const GROUPS: SettingGroup[] = [{ id: "search", label: "搜索", help: "web_search / web_fetch 工具：查网页、读网页。", module: "search" }];

export const SETTINGS: SettingDef[] = [{ key: "SEARCH_PROVIDER", group: "search", label: "搜索服务", kind: "enum", capability: "search" }];
