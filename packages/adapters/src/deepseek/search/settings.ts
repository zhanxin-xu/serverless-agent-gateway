// Settings of the DeepSeek search provider.
import { bodyOverrideSetting, type ConfigDecl } from "@gateway/core";
import { SEARCH_DEEPSEEK } from "./config.js";

const key = SEARCH_DEEPSEEK.key;

export const CONFIG: ConfigDecl = {
  group: {
    id: "search.deepseek",
    label: "DeepSeek",
    help: "DeepSeek 的搜索和网页抓取接口，每千次成功调用约 ¥5，能查余额。",
    enabledBy: key("api_key"),
    essentials: [key("api_key")],
  },
  settings: [
    { key: key("api_key"), group: "search.deepseek", label: "API Key", kind: "secret" },
    { key: key("base_url"), group: "search.deepseek", label: "服务地址", kind: "url", default: "https://api.deepseek.com" },
    bodyOverrideSetting(key("extra_body"), "search.deepseek", '{"count":8}', "搜索和抓取两个接口都会合并。"),
  ],
};
