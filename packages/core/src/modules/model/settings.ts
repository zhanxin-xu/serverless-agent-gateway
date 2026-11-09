// The model module's own settings; each provider (src/modules/model/capability.ts) brings its own: endpoint, key, model…
import type { ConfigDecl } from "../types.js";

const group = "llm";

export const CONFIG: ConfigDecl = {
  group: { id: group, label: "模型", help: "聊天用的模型。" },
  settings: [
    { key: "MODEL_PROVIDER", group, label: "模型服务", kind: "enum", capability: "chat-model" },
    {
      key: "MODEL_TIMEOUT_MS",
      group,
      label: "单次调用超时（毫秒）",
      kind: "int",
      default: "280000",
      help: "一次模型调用最多等这么久；运行中还受函数剩余时间限制，取较短的。",
    },
  ],
};
