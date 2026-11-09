// The chat module's own settings.
import type { ConfigDecl } from "../types.js";

export const CONFIG: ConfigDecl = {
  group: { id: "chat", label: "聊天", help: "发消息和表情包。" },
  settings: [{ key: "STICKER_BASE_URL", group: "chat", label: "表情包地址", kind: "url", help: "留空用表情包自带的 CDN。自托管时按相同路径放图片。" }],
};
