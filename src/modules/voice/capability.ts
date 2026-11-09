/** Speech: the interface every speech provider implements, and the providers. */
import { providersOf } from "../capability.js";
import type { Capability } from "../types.js";

/** A voice the model can pick. */
export interface VoiceChoice {
  /** What goes in send_voice's `voice`: "self" (her own), "self_sing", "none"… */
  id: string;
  /** What it is, for the tool description. */
  about: string;
}

export interface SpeechRequest {
  text: string;
  /** The model's own direction for this message ("" = none). */
  style: string;
  mode: "speak" | "sing";
  voice: string;
  speed?: number;
  /** The caller's time budget. */
  timeoutMs: number;
}

export interface SpeechResult {
  /** 16-bit mono PCM. */
  pcm: Buffer;
  sampleRate: number;
  /** The model that spoke, for the tool's report. */
  model: string;
}

export interface SpeechBackend {
  /** The voices on offer, the default first. */
  voices(): VoiceChoice[];
  /**
   * How to write `text` and `instructions` for the model in use: the one place
   * a provider shapes what the model is told (docs/design/modules.md 6.3),
   * because Fish wants inline tags and Seed must not see any. `tool` goes in
   * send_voice's description, `prompt` (one line) in the voice module's section.
   */
  dialect(): { tool: string; prompt: string };
  speak(request: SpeechRequest): Promise<SpeechResult>;
}

export const speechCapability: Capability<SpeechBackend> = {
  id: "speech",
  label: "语音服务",
  selectionSetting: "VOICE_PROVIDER",
  // Whatever the deployment composed for it (src/composition.ts).
  get providers() {
    return providersOf<SpeechBackend>(this.id);
  },
};
