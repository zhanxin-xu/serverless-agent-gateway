// Settings of the OpenAI-compatible speech provider (pure data: src/settings/catalog.ts collects them).
import type { SettingDef, SettingGroup } from "../../../../settings/catalog.js";

export const DEFAULT_VOICE_REFERENCE = "assets/voice/dafeiyu.mp3";

export const GROUPS: SettingGroup[] = [
  {
    id: "voice.openai-speech",
    label: "OpenAI 兼容语音接口",
    help: "POST {服务地址}/audio/speech，默认 OpenRouter，默认克隆大肥鱼的声音。支持 Fish Audio 和 ByteDance Seed 两类模型的写法。",
    enabledBy: "TTS_API_KEY",
    module: "voice",
    provider: { capability: "speech", id: "openai-speech" },
  },
];

const group = "voice.openai-speech";

export const SETTINGS: SettingDef[] = [
  { key: "TTS_API_KEY", group, label: "API Key", kind: "secret" },
  { key: "TTS_BASE_URL", group, label: "服务地址", kind: "url", default: "https://openrouter.ai/api/v1" },
  { key: "TTS_MODEL", group, label: "模型", kind: "text", default: "fish-audio/drama-3" },
  { key: "TTS_VOICE", group, label: "音色 ID", kind: "text", help: "服务商的音色 ID。留空时由参考音频决定声音。" },
  { key: "TTS_REFERENCE_AUDIO", group, label: "参考音频", kind: "text", default: DEFAULT_VOICE_REFERENCE, help: "要克隆的声音：部署里的文件或 https 链接；填 none 关闭克隆。" },
  { key: "TTS_REFERENCE_TEXT", group, label: "参考音频的文字", kind: "textarea", help: "参考音频里说的话。用内置音频时自动填好。" },
  { key: "TTS_SING_REFERENCE_AUDIO", group, label: "唱歌参考音频", kind: "text", help: "同一个声音唱歌的片段，提供给模型作为 dafeiyu_sing。" },
  { key: "TTS_SING_REFERENCE_TEXT", group, label: "唱歌参考的文字", kind: "textarea" },
  { key: "TTS_INSTRUCTIONS", group, label: "固定语气指示", kind: "text", help: "每句话都带上的 instructions，例如“软萌可爱的小女孩”。" },
  { key: "TTS_EXTRA_BODY", group, label: "额外请求参数", kind: "json", help: '例如 {"speed":1.1}' },
  { key: "TTS_TIMEOUT_MS", group, label: "超时（毫秒）", kind: "int", default: "120000" },
];
