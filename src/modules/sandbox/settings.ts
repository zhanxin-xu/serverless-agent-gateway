// The sandbox module's own settings.
import type { ConfigDecl } from "../types.js";

export const CONFIG: ConfigDecl = {
  group: { id: "sandbox", label: "沙盒", help: "bash、读写文件、存附件、发文件：每个聊天一个持久的工作区。" },
  settings: [
    { key: "SANDBOX_PROVIDER", group: "sandbox", label: "沙盒服务", kind: "enum", capability: "sandbox" },
    { key: "SANDBOX_COMMAND_TIMEOUT_SECONDS", group: "sandbox", label: "单条命令时限（秒）", kind: "int", default: "60" },
  ],
};
