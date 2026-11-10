// Settings of an OpenAI-compatible speech instance; the voice to clone defaults to the persona's.
import { bodyOverrideSetting, persona, type ConfigDecl } from "@gateway/core";
import { speechConfig, type SpeechInstance } from "./config.js";

/** An instance's settings, each named VOICE_{ID}_{FIELD}. */
export function speechSettings(instance: SpeechInstance): ConfigDecl {
  const { key } = speechConfig(instance);
  const group = `voice.${instance.id}`;
  return {
    group: {
      id: group,
      label: instance.label,
      help: instance.help,
      enabledBy: key("api_key"),
      essentials: [...(instance.baseUrl ? [] : [key("base_url")]), key("api_key")],
    },
    settings: [
      { key: key("api_key"), group, label: "API Key", kind: "secret" },
      { key: key("base_url"), group, label: "服务地址", kind: "url", ...(instance.baseUrl ? { default: instance.baseUrl } : {}) },
      { key: key("model"), group, label: "模型", kind: "text", ...(instance.model ? { default: instance.model } : {}) },
      { key: key("voice"), group, label: "音色 ID", kind: "text", help: "服务商的音色 ID。留空时由参考音频决定声音。" },
      {
        key: key("reference_audio"),
        group,
        label: "参考音频",
        kind: "text",
        default: persona().voice?.clip ?? "",
        help: "要克隆的声音：部署里的文件或 https 链接；填 none 关闭克隆。默认是人设自带的声音。",
      },
      { key: key("reference_text"), group, label: "参考音频的文字", kind: "textarea", help: "参考音频里说的话。用人设自带的音频时自动填好。" },
      { key: key("sing_reference_audio"), group, label: "唱歌参考音频", kind: "text", help: "同一个声音唱歌的片段，提供给模型作为音色 self_sing。" },
      { key: key("sing_reference_text"), group, label: "唱歌参考的文字", kind: "textarea" },
      { key: key("instructions"), group, label: "固定语气指示", kind: "text", help: "每句话都带上的 instructions，例如“软萌可爱的小女孩”。" },
      bodyOverrideSetting(key("extra_body"), group, '{"speed":1.1}'),
      { key: key("timeout_ms"), group, label: "超时（毫秒）", kind: "int", default: "120000" },
    ],
  };
}
