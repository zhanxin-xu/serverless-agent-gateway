/** An OpenAI-compatible speech API as the speech provider. */
import type { Provider } from "../../modules/types.js";
import { notReady, READY } from "../../modules/types.js";
import { speechCapability, type SpeechBackend } from "../../modules/voice/capability.js";
import { openaiSpeechClient } from "./client.js";
import { speechConfig } from "./config.js";
import { speechSettings } from "./settings.js";

export const openaiSpeechProvider: Provider<SpeechBackend> = {
  id: "openai-speech",
  capability: speechCapability.id,
  get config() {
    return speechSettings();
  },
  available: () => (speechConfig.apiKey ? READY : notReady("还没填语音的 API Key")),
  create: () => openaiSpeechClient,
};
