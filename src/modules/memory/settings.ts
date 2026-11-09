// The memory module's own settings (pure data: src/settings/catalog.ts collects them).
import type { SettingDef, SettingGroup } from "../../settings/catalog.js";

export const GROUPS: SettingGroup[] = [{ id: "memory", label: "长期记忆", help: "remember / recall / forget 工具：所有聊天共用一份记忆。", module: "memory" }];

export const SETTINGS: SettingDef[] = [
  {
    key: "MEMORY_PROVIDER",
    group: "memory",
    label: "记忆存储",
    kind: "enum",
    capability: "vector-memory",
    help: "记忆存在存储那边：换存储后，旧存储里的记忆不会跟过来。",
  },
];
