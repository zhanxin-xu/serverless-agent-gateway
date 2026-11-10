import { bodyOverrideSetting, type ConfigDecl } from "@gateway/core";
import type { PiAiInstance } from "./config.js";
import { piAiConfig } from "./config.js";
import { PROTOCOLS } from "./protocols.js";

const PROTOCOL_LABELS: Record<keyof typeof PROTOCOLS, string> = {
  "openai-responses": "OpenAI Responses（POST /responses）",
  "openai-completions": "OpenAI Chat Completions（POST /chat/completions）",
  "anthropic-messages": "Anthropic Messages（POST /messages）",
  "google-generative-ai": "Google Gemini（generateContent）",
};

/** An instance's settings, each named MODEL_{ID}_{FIELD}. */
export function chatModelSettings(instance: PiAiInstance): ConfigDecl {
  const { key } = piAiConfig(instance);
  const group = `model.${instance.id}`;
  return {
    group: {
      id: group,
      label: instance.label,
      help: instance.help,
      enabledBy: key("api_key"),
      essentials: [...(instance.baseUrl ? [] : [key("base_url")]), key("api_key"), key("model")],
    },
    settings: [
      {
        key: key("api"),
        group,
        label: "接口协议",
        kind: "enum",
        default: instance.api,
        options: Object.entries(PROTOCOL_LABELS).map(([value, label]) => ({ value, label })),
        help: "换协议、服务地址或模型后，之前的思维链不再回传（只保留文字），提示词缓存从头开始。",
      },
      {
        key: key("base_url"),
        group,
        label: "服务地址",
        kind: "url",
        ...(instance.baseUrl ? { default: instance.baseUrl } : {}),
        help:
          "协议的根地址，不含接口路径：OpenAI 两种填到 /v1 为止（如 https://api.openai.com/v1），" +
          "Anthropic 不带 /v1（如 https://api.anthropic.com），Gemini 带上版本（如 https://generativelanguage.googleapis.com/v1beta）。",
      },
      { key: key("api_key"), group, label: "API Key", kind: "secret" },
      { key: key("model"), group, label: "模型", kind: "text", ...(instance.model ? { default: instance.model } : {}) },
      bodyOverrideSetting(
        key("extra_body"),
        group,
        'OpenRouter 的 {"provider":{"only":["openai"],"allow_fallbacks":false},"reasoning":{"effort":"high"}}、' +
          'OpenAI 的 {"store":true}（请求留在 OpenAI 后台的 Logs 里，内容存 30 天）、Anthropic 的 {"thinking":{"type":"adaptive"}}、' +
          'Gemini 的 {"config":{"thinkingConfig":{"includeThoughts":true}}}。',
        "字段名按所选协议，思维链也在这里开。",
      ),
      { key: key("extra_headers"), group, label: "额外请求头", kind: "json", help: '例如 {"X-Title":"my-bot"}' },
      {
        key: key("max_output_tokens"),
        group,
        label: "单次最多输出（token）",
        kind: "int",
        help: "包括思维链。不填时只有 Anthropic 协议带上限（它必须有，用 32000），其余协议由服务决定。",
      },
    ],
  };
}
