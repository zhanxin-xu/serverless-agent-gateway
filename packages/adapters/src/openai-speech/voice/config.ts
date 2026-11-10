import { instanceSettings, persona } from "@gateway/core";

/** One OpenAI-compatible speech endpoint the deployment composes (openaiSpeechProvider). */
export interface SpeechInstance {
  /** Unique among the voice module's providers; its settings are VOICE_{ID}_… */
  id: string;
  /** Its name in the console. */
  label: string;
  /** A line about it in the console. */
  help: string;
  /** Its base URL by default; "" when it has none. */
  baseUrl: string;
  /** Its speech model by default, if any. */
  model?: string;
}

/** An instance's settings: POST {base URL}/audio/speech. */
export function speechConfig(instance: SpeechInstance) {
  const s = instanceSettings("voice", instance.id);
  /** "none" turns a clip setting off. */
  const clip = (field: string) => {
    const value = s.value(field);
    return value.toLowerCase() === "none" ? "" : value;
  };
  return {
    key: s.key,
    get apiKey() {
      return s.value("api_key");
    },
    get baseUrl() {
      return s.value("base_url", instance.baseUrl).replace(/\/+$/, "");
    },
    /** The speech model (set here, not chosen by the agent). */
    get model() {
      return s.value("model", instance.model ?? "");
    },
    /** The API's `voice` (a provider voice ID). Empty: the reference audio sets the voice. */
    get voice() {
      return s.value("voice");
    },
    /** The voice to clone: a file in the deployment, or an https URL; "none" turns cloning off. */
    get referenceAudio() {
      return clip("reference_audio");
    },
    /** What the reference audio says (helps the clone). Defaults to the persona's clip's words while that clip is used. */
    get referenceText() {
      const own = persona().voice;
      return s.value("reference_text", own && this.referenceAudio === own.clip ? own.transcript : "");
    },
    /** Optional second clip of the same voice singing, offered to the model as voice "self_sing". */
    get singReferenceAudio() {
      return clip("sing_reference_audio");
    },
    /** What the singing clip sings. */
    get singReferenceText() {
      return s.value("sing_reference_text");
    },
    /** The API's `instructions`: a standing direction for every line, e.g. "软萌可爱的小女孩". The model can add its own. */
    get instructions() {
      return s.value("instructions");
    },
    /** Extra request body fields, e.g. {"speed":1.1} or {"provider":{"options":{...}}}. */
    get extraBody() {
      return s.json("extra_body");
    },
    get timeoutMs() {
      return s.int("timeout_ms");
    },
  };
}

export type SpeechConfig = ReturnType<typeof speechConfig>;
