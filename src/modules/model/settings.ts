// The chat model's settings: the model module owns them, though the agent loop (src/agent) reads them too.
import type { ConfigDecl } from "../types.js";

const group = "llm";

export const CONFIG: ConfigDecl = {
  group: {
    id: group,
    label: "模型",
    help: "任何兼容 OpenAI Responses API 的服务（POST {服务地址}/responses），默认 OpenRouter。",
    enabledBy: "OPENAI_RESPONSES_API_KEY",
    essentials: ["OPENAI_RESPONSES_BASE_URL", "OPENAI_RESPONSES_API_KEY", "OPENAI_RESPONSES_MODEL"],
  },
  settings: [
    { key: "OPENAI_RESPONSES_BASE_URL", group, label: "服务地址", kind: "url", default: "https://openrouter.ai/api/v1" },
    { key: "OPENAI_RESPONSES_API_KEY", group, label: "API Key", kind: "secret" },
    { key: "OPENAI_RESPONSES_MODEL", group, label: "模型", kind: "text", default: "openai/gpt-6-luna" },
    {
      key: "OPENAI_RESPONSES_EXTRA_BODY",
      group,
      label: "额外请求参数",
      kind: "json",
      help: '合并进每次请求体，例如 {"provider":{"only":["openai"],"allow_fallbacks":false}}。不能覆盖 instructions、input、tools、tool_choice。',
    },
    { key: "OPENAI_RESPONSES_EXTRA_HEADERS", group, label: "额外请求头", kind: "json", help: '例如 {"X-Title":"my-bot"}' },
    { key: "OPENAI_RESPONSES_TIMEOUT_MS", group, label: "单次调用超时（毫秒）", kind: "int", default: "280000" },
    {
      key: "MODEL_PRICE_INPUT",
      group,
      label: "输入单价（美元 / 百万 token）",
      kind: "number",
      min: 0,
      help: "接口没返回花费时，用这三个单价估算每个群的花费（每群额度按它算）。OpenRouter 会返回花费，可以不填。",
    },
    { key: "MODEL_PRICE_CACHED", group, label: "缓存命中单价（美元 / 百万 token）", kind: "number", min: 0 },
    { key: "MODEL_PRICE_OUTPUT", group, label: "输出单价（美元 / 百万 token）", kind: "number", min: 0 },
  ],
};
