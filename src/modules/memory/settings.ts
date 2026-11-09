// The memory module's own settings (pure data: src/settings/catalog.ts collects them).
import type { SettingDef, SettingGroup } from "../../settings/catalog.js";

export const GROUPS: SettingGroup[] = [{ id: "memory", label: "长期记忆", help: "remember / recall / forget 工具：所有聊天共用一份记忆。", module: "memory" }];

export const SETTINGS: SettingDef[] = [
  {
    key: "MODULE_MEMORY",
    group: "memory",
    label: "开关",
    kind: "enum",
    default: "on",
    options: [
      { value: "on", label: "开" },
      { value: "off", label: "关" },
    ],
    help: "关掉后所有聊天都不提供这个模块；依赖它的模块也会跟着关。",
  },
  {
    key: "MEMORY_PROVIDER",
    group: "memory",
    label: "记忆存储",
    kind: "enum",
    capability: "vector-memory",
    help: "记忆存在存储那边：换存储后，旧存储里的记忆不会跟过来。",
  },
];
