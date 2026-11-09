// The voice module's own settings (pure data: src/settings/catalog.ts collects them).
import type { SettingDef, SettingGroup } from "../../settings/catalog.js";

export const GROUPS: SettingGroup[] = [{ id: "voice", label: "语音", help: "send_voice 工具：说话、唱歌、变声。", module: "voice" }];

export const SETTINGS: SettingDef[] = [{ key: "VOICE_PROVIDER", group: "voice", label: "语音服务", kind: "enum", capability: "speech" }];
