// The search module's own settings.
import type { ConfigDecl } from "../types.js";

export const CONFIG: ConfigDecl = {
  group: { id: "search", label: "搜索", help: "web_search / web_fetch 工具：查网页、读网页。" },
  settings: [{ key: "SEARCH_PROVIDER", group: "search", label: "搜索服务", kind: "enum", capability: "search" }],
};
