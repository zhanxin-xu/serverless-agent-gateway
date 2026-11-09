// The voice module's own settings (pure data: src/settings/catalog.ts collects them).
import type { SettingDef, SettingGroup } from "../../settings/catalog.js";

export const GROUPS: SettingGroup[] = [{ id: "voice", label: "语音", help: "send_voice 工具：说话、唱歌、变声。", module: "voice" },
];

export const SETTINGS: SettingDef[] = [
  {
    key: "MODULE_VOICE",
    group: "voice",
    label: "开关",
    kind: "enum",
    default: "on",
    options: [
      { value: "on", label: "开" },
      { value: "off", label: "关" },
    ],
    help: "关掉后所有聊天都不提供这个模块；依赖它的模块也会跟着关。",
  },
  { key: "VOICE_PROVIDER", group: "voice", label: "语音服务", kind: "enum", capability: "speech" },
];
