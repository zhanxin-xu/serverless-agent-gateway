import type { ConfigDecl } from "@gateway/core";
import { PROTOCOLS } from "./protocols.js";

const group = "pi-ai";

const PROTOCOL_LABELS: Record<keyof typeof PROTOCOLS, string> = {
  "openai-responses": "OpenAI Responses（POST /responses）",
  "openai-completions": "OpenAI Chat Completions（POST /chat/completions）",
  "anthropic-messages": "Anthropic Messages（POST /messages）",
  "google-generative-ai": "Google Gemini（generateContent）",
};

export const CONFIG: ConfigDecl = {
  group: {
    id: group,
    label: "通用模型接口",
    help: "用 pi-ai 调模型，支持四种接口协议，任何兼容其中一种的服务都能用。默认 OpenRouter 的 Responses 接口。",
    enabledBy: "MODEL_API_KEY",
    essentials: ["MODEL_API", "MODEL_BASE_URL", "MODEL_API_KEY", "MODEL_ID"],
  },
  settings: [
    {
      key: "MODEL_API",
      group,
      label: "接口协议",
      kind: "enum",
      default: "openai-responses",
      options: Object.entries(PROTOCOL_LABELS).map(([value, label]) => ({ value, label })),
      help: "换协议、服务地址或模型后，之前的思维链不再回传（只保留文字），提示词缓存从头开始。",
    },
    {
      key: "MODEL_BASE_URL",
      group,
      label: "服务地址",
      kind: "url",
      default: "https://openrouter.ai/api/v1",
      help:
        "协议的根地址，不含接口路径：OpenAI 两种填到 /v1 为止（如 https://openrouter.ai/api/v1、https://api.openai.com/v1），" +
        "Anthropic 不带 /v1（如 https://api.anthropic.com），Gemini 带上版本（如 https://generativelanguage.googleapis.com/v1beta）。",
    },
    { key: "MODEL_API_KEY", group, label: "API Key", kind: "secret" },
    { key: "MODEL_ID", group, label: "模型", kind: "text", default: "openai/gpt-6-luna" },
    {
      key: "MODEL_EXTRA_BODY",
      group,
      label: "额外请求参数",
      kind: "json",
      help:
        "按所选协议的字段名合并进每次请求体，思维链也在这里开，例如 OpenRouter 的 " +
        '{"provider":{"only":["openai"],"allow_fallbacks":false},"reasoning":{"effort":"high"}}、' +
        'Anthropic 的 {"thinking":{"type":"adaptive"}}；Gemini 合并进请求的 config，例如 {"thinkingConfig":{"includeThoughts":true}}。' +
        "消息、系统提示、工具和工具选择由网关生成，不能在这里设。",
    },
    { key: "MODEL_EXTRA_HEADERS", group, label: "额外请求头", kind: "json", help: '例如 {"X-Title":"my-bot"}' },
    {
      key: "MODEL_MAX_OUTPUT_TOKENS",
      group,
      label: "单次最多输出（token）",
      kind: "int",
      help: "包括思维链。不填时只有 Anthropic 协议带上限（它必须有，用 32000），其余协议由服务决定。",
    },
    {
      key: "MODEL_PRICE_INPUT",
      group,
      label: "输入单价（美元 / 百万 token）",
      kind: "number",
      min: 0,
      help: "服务没在响应里报花费时，用这三个单价估算每个群的花费（每群额度按它算）。OpenRouter 会报花费，可以不填。",
    },
    { key: "MODEL_PRICE_CACHED", group, label: "缓存命中单价（美元 / 百万 token）", kind: "number", min: 0 },
    { key: "MODEL_PRICE_OUTPUT", group, label: "输出单价（美元 / 百万 token）", kind: "number", min: 0 },
  ],
};
