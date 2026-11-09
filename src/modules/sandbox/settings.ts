// The sandbox module's own settings (pure data: src/settings/catalog.ts collects them).
import type { SettingDef, SettingGroup } from "../../settings/catalog.js";

export const GROUPS: SettingGroup[] = [
  { id: "sandbox", label: "沙盒", help: "bash、读写文件、存附件、发文件：每个聊天一个持久的工作区。", module: "sandbox" },
];

export const SETTINGS: SettingDef[] = [
  {
    key: "MODULE_SANDBOX",
    group: "sandbox",
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
    key: "SANDBOX_PROVIDER",
    group: "sandbox",
    label: "沙盒服务",
    kind: "enum",
    capability: "sandbox",
    help: "工作区的文件存在服务那边：换服务后，旧工作区里的文件不会跟过来。",
  },
  { key: "SANDBOX_COMMAND_TIMEOUT_SECONDS", group: "sandbox", label: "单条命令时限（秒）", kind: "int", default: "60" },
];
