/** An OpenAI-compatible speech API as a speech provider, composed once per endpoint. */
import { notReady, READY, speechCapability, type Provider, type SpeechBackend } from "@gateway/core";
import { openaiSpeechClient } from "./client.js";
import { speechConfig, type SpeechInstance } from "./config.js";
import { speechSettings } from "./settings.js";

export type { SpeechInstance } from "./config.js";

export function openaiSpeechProvider(instance: SpeechInstance): Provider<SpeechBackend> {
  const config = speechConfig(instance);
  const client = openaiSpeechClient(config);
  return {
    id: instance.id,
    capability: speechCapability.id,
    // Read when the catalog collects it: its defaults come from the composed persona.
    get config() {
      return speechSettings(instance);
    },
    available: () => {
      if (!config.apiKey) return notReady(`还没填 ${instance.label} 的 API Key`);
      if (!config.baseUrl) return notReady(`还没填 ${instance.label} 的服务地址`);
      return READY;
    },
    create: () => client,
    billedTo: () => config.apiKey || undefined,
  };
}
