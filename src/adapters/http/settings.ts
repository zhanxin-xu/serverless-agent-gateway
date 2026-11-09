// The generic HTTP channel's settings.
import type { ConfigDecl } from "../../modules/types.js";

export const CONFIG: ConfigDecl = {
  group: { id: "http", label: "HTTP", help: "通用 HTTP 接口：POST /api/webhook/http，带 Authorization: Bearer <token>。", enabledBy: "HTTP_CHANNEL_TOKEN" },
  settings: [{ key: "HTTP_CHANNEL_TOKEN", group: "http", label: "Bearer Token", kind: "secret", generate: true }],
};
