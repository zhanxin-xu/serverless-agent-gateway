/** An OpenAI-compatible speech API as the speech provider. */
import type { Provider } from "../../../types.js";
import { notReady, READY } from "../../../types.js";
import type { SpeechBackend } from "../../capability.js";
import { openaiSpeechClient } from "./client.js";
import { speechConfig } from "./config.js";
import { CONFIG } from "./settings.js";

export const openaiSpeechProvider: Provider<SpeechBackend> = {
  id: "openai-speech",
  config: CONFIG,
  available: () => (speechConfig.apiKey ? READY : notReady("还没填语音的 API Key")),
  create: () => openaiSpeechClient,
};
