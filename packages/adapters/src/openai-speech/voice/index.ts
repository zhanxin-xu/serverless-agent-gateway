/** An OpenAI-compatible speech API as the speech provider. */
import { notReady, READY, speechCapability, type Provider, type SpeechBackend } from "@gateway/core";
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
