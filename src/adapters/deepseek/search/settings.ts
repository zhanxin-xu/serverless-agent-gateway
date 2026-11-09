// Settings of the DeepSeek search provider.
import type { ConfigDecl } from "../../../modules/types.js";

export const CONFIG: ConfigDecl = {
  group: {
    id: "search.deepseek",
    label: "DeepSeek",
    help: "DeepSeek 的搜索和网页抓取接口，每千次成功调用约 ¥5，能查余额。",
    enabledBy: "DEEPSEEK_API_KEY",
    essentials: ["DEEPSEEK_API_KEY"],
  },
  settings: [
    { key: "DEEPSEEK_API_KEY", group: "search.deepseek", label: "DeepSeek API Key", kind: "secret" },
    { key: "DEEPSEEK_BASE_URL", group: "search.deepseek", label: "服务地址", kind: "url", default: "https://api.deepseek.com" },
  ],
};
