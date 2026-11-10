// Settings of an OpenAI Image API provider instance, each named IMAGE_{ID}_{FIELD}.
import type { ConfigDecl } from "@gateway/core";
import { DEFAULT_PRICES, imagesConfig, type ImagesInstance } from "./config.js";

export function imagesSettings(instance: ImagesInstance): ConfigDecl {
  const { key } = imagesConfig(instance);
  const group = `image.${instance.id}`;
  return {
    group: { id: group, label: instance.label, help: instance.help, enabledBy: key("api_key"), essentials: [key("api_key")] },
    settings: [
      { key: key("api_key"), group, label: "API Key", kind: "secret" },
      { key: key("base_url"), group, label: "服务地址", kind: "url", default: instance.baseUrl, help: "填到 /v1 为止。" },
      { key: key("model"), group, label: "模型", kind: "text", default: instance.model },
      {
        key: key("quality"),
        group,
        label: "质量",
        kind: "enum",
        default: "low",
        options: ["auto", "low", "medium", "high", "xhigh", "max"].map((v) => ({ value: v, label: v })),
        help: "决定价格，由这里定，不让模型选。xhigh 和 max 只有 2.5 之后的 sunburst / flare 支持。",
      },
      { key: key("extra_body"), group, label: "额外请求参数", kind: "json", help: '合并进每次请求体，例如 {"moderation":"low"}。' },
      {
        key: key("prices"),
        group,
        label: "价格（美元 / 百万 token）",
        kind: "json",
        default: JSON.stringify(DEFAULT_PRICES),
        help: "接口只返回 token 数，按这个价格估算每次花了多少（花费上限按它算）。默认是 gpt-image-2.6 的标价：文字输入 5、参考图输入 8、出图 30；换了模型或价格变了就改这里。",
      },
      { key: key("timeout_ms"), group, label: "超时（毫秒）", kind: "int", default: "180000" },
    ],
  };
}
