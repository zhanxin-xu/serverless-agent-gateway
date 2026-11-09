// Settings of the OpenRouter Image API provider (pure data: src/settings/catalog.ts collects them).
import type { SettingDef, SettingGroup } from "../../../../settings/catalog.js";

export const GROUPS: SettingGroup[] = [
  {
    id: "image.openrouter-images",
    label: "OpenRouter Image API",
    help: "POST {服务地址}/images，OpenRouter 的图像接口。按张计费，价格由模型和质量决定。",
    enabledBy: "IMAGE_API_KEY",
    module: "image",
    provider: { capability: "image", id: "openrouter-images" },
  },
];

const group = "image.openrouter-images";

export const SETTINGS: SettingDef[] = [
  { key: "IMAGE_API_KEY", group, label: "API Key", kind: "secret" },
  { key: "IMAGE_BASE_URL", group, label: "服务地址", kind: "url", default: "https://openrouter.ai/api/v1" },
  { key: "IMAGE_MODEL", group, label: "模型", kind: "text", default: "openai/gpt-image-2.6-sunburst" },
  {
    key: "IMAGE_QUALITY",
    group,
    label: "质量",
    kind: "enum",
    default: "low",
    options: ["auto", "low", "medium", "high", "xhigh", "max"].map((v) => ({ value: v, label: v })),
    help: "决定价格，由这里定，不让模型选。",
  },
  {
    key: "IMAGE_RESOLUTION",
    group,
    label: "分辨率",
    kind: "enum",
    default: "",
    options: [{ value: "", label: "不发送" }, ...["512", "768", "1K", "1.5K", "2K", "4K"].map((v) => ({ value: v, label: v }))],
    help: "只对支持这个参数的模型有用；默认的 gpt-image 不支持，总是约 1024px。",
  },
  { key: "IMAGE_EXTRA_BODY", group, label: "额外请求参数", kind: "json", help: '例如 {"provider":{"options":{"openai":{"moderation":"low"}}}}' },
  { key: "IMAGE_TIMEOUT_MS", group, label: "超时（毫秒）", kind: "int", default: "180000" },
];
