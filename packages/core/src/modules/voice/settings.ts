// The voice module's own settings.
import type { ConfigDecl } from "../types.js";

export const CONFIG: ConfigDecl = {
  group: { id: "voice", label: "语音", help: "send_voice 工具：说话、唱歌、变声。" },
  settings: [{ key: "VOICE_PROVIDER", group: "voice", label: "语音服务", kind: "enum", capability: "speech" }],
};
