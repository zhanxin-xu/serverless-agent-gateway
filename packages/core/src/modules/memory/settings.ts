// The memory module's own settings.
import type { ConfigDecl } from "../types.js";

export const CONFIG: ConfigDecl = {
  group: { id: "memory", label: "长期记忆", help: "remember / recall / forget 工具：所有聊天共用一份记忆。" },
  settings: [{ key: "MEMORY_PROVIDER", group: "memory", label: "记忆存储", kind: "enum", capability: "vector-memory" }],
};
