// Settings of the OpenRouter Image API provider.
import type { ConfigDecl } from "@gateway/core";
import { IMAGE_OPENROUTER } from "./config.js";

const key = IMAGE_OPENROUTER.key;

const group = "image.openrouter";

export const CONFIG: ConfigDecl = {
  group: {
    id: group,
    label: "OpenRouter Image API",
    help: "POST {服务地址}/images，OpenRouter 的图像接口。按张计费，价格由模型和质量决定。",
    enabledBy: key("api_key"),
    essentials: [key("api_key")],
  },
  settings: [
    { key: key("api_key"), group, label: "API Key", kind: "secret" },
    { key: key("base_url"), group, label: "服务地址", kind: "url", default: "https://openrouter.ai/api/v1" },
    { key: key("model"), group, label: "模型", kind: "text", default: "openai/gpt-image-2.6-sunburst" },
    {
      key: key("quality"),
      group,
      label: "质量",
      kind: "enum",
      default: "low",
      options: ["auto", "low", "medium", "high", "xhigh", "max"].map((v) => ({ value: v, label: v })),
      help: "决定价格，由这里定，不让模型选。",
    },
    {
      key: key("resolution"),
      group,
      label: "分辨率",
      kind: "enum",
      default: "",
      options: [{ value: "", label: "不发送" }, ...["512", "768", "1K", "1.5K", "2K", "4K"].map((v) => ({ value: v, label: v }))],
      help: "只对支持这个参数的模型有用；默认的 gpt-image 不支持，总是约 1024px。",
    },
    { key: key("extra_body"), group, label: "额外请求参数", kind: "json", help: '例如 {"provider":{"options":{"openai":{"moderation":"low"}}}}' },
    { key: key("timeout_ms"), group, label: "超时（毫秒）", kind: "int", default: "180000" },
  ],
};
