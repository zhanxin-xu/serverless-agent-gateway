/**
 * An OpenAI-compatible speech API (POST {TTS_BASE_URL}/audio/speech, OpenRouter
 * by default). The voice is cloned from a short reference clip on every
 * request (`input_references`), so it stays the same voice without an
 * account-side voice. What the model may write depends on TTS_MODEL (dialects.ts).
 */
import { bundledDataUrl } from "../../../../media/assets.js";
import type { SpeechBackend, VoiceChoice } from "../../capability.js";
import { speechConfig } from "./config.js";
import { kindOf } from "./dialects.js";

/** When the API doesn't say (it normally does: "audio/pcm;rate=44100;channels=1"). */
const DEFAULT_SAMPLE_RATE = 44_100;

/** The voices the model can pick: the clone, its singing clip when configured, or none. */
function voices(): VoiceChoice[] {
  const { referenceAudio, singReferenceAudio } = speechConfig;
  return [
    ...(referenceAudio ? [{ id: "dafeiyu", about: '"dafeiyu" (default): your own voice, cloned from a short clip of you talking.' }] : []),
    ...(singReferenceAudio ? [{ id: "dafeiyu_sing", about: '"dafeiyu_sing": the same voice cloned from a clip of you singing; try it when singing.' }] : []),
    {
      id: "none",
      about:
        '"none": no clone; describe the voice in `instructions` ("低沉沙哑的大叔", "奶声奶气的小男孩") to play another character, ' +
        "then go back to your own voice.",
    },
  ];
}

type ReferencePart = { type: "input_audio"; input_audio: { data?: string; url?: string } } | { type: "text"; text: string };

/** `input_references` for a clip (and what it says), or undefined for no clip. */
async function references(clip: string, transcript: string, setting: string): Promise<ReferencePart[] | undefined> {
  if (!clip) return undefined;
  let audio: ReferencePart;
  if (/^https?:\/\//i.test(clip)) {
    audio = { type: "input_audio", input_audio: { url: clip } };
  } else {
    try {
      audio = { type: "input_audio", input_audio: { data: await bundledDataUrl(clip) } };
    } catch (err) {
      throw new Error(`can't read ${setting} ${clip}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return transcript ? [audio, { type: "text", text: transcript }] : [audio];
}

/** "audio/pcm;rate=44100;channels=1" → 44100 (and 1). */
function pcmFormat(contentType: string): { sampleRate: number; channels: number } {
  const field = (name: string) => Number(new RegExp(`(?:^|;)\\s*${name}=(\\d+)`, "i").exec(contentType)?.[1]);
  const rate = field("rate");
  const channels = field("channels");
  return {
    sampleRate: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_SAMPLE_RATE,
    channels: Number.isInteger(channels) && channels > 1 ? channels : 1,
  };
}

/** Interleaved 16-bit PCM → mono (Seed sends stereo; voice messages are mono). */
function toMono(pcm: Buffer, channels: number): Buffer {
  if (channels === 1) return pcm;
  const frames = Math.floor(pcm.byteLength / 2 / channels);
  const out = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += pcm.readInt16LE((i * channels + c) * 2);
    out.writeInt16LE(Math.round(sum / channels), i * 2);
  }
  return out;
}

export const openaiSpeechClient: SpeechBackend = {
  voices,
  dialect() {
    const kind = kindOf(speechConfig.model);
    return { tool: `The speech model is ${kind.about}\n${kind.syntax}`, prompt: kind.hint, inlineTags: kind.inlineTags };
  },
  async speak({ text, style, mode, voice, speed, timeoutMs: budget }) {
    const { apiKey, baseUrl, model, voice: providerVoice, instructions: standing, extraBody, timeoutMs } = speechConfig;
    const kind = kindOf(model);
    const sing = mode === "sing";
    // With no clone the standing direction (it describes your voice) would fight the character's.
    const standingPart = voice === "none" ? "" : standing;
    const instructions = (sing ? [standingPart, kind.sing.instructions, style || kind.sing.defaultStyle] : [standingPart, style])
      .filter(Boolean)
      .join("；");
    const refs =
      voice === "dafeiyu"
        ? await references(speechConfig.referenceAudio, speechConfig.referenceText, "TTS_REFERENCE_AUDIO")
        : voice === "dafeiyu_sing"
          ? await references(speechConfig.singReferenceAudio, speechConfig.singReferenceText, "TTS_SING_REFERENCE_AUDIO")
          : undefined;
    const body = {
      model,
      ...extraBody,
      input: sing ? kind.sing.input(text) : text,
      response_format: "pcm",
      ...(voice === "none" && providerVoice ? { voice: providerVoice } : {}),
      ...(instructions ? { instructions } : {}),
      ...(speed !== undefined && kind.speed ? { speed } : {}),
      ...(refs ? { input_references: refs } : {}),
    };
    const res = await fetch(`${baseUrl}/audio/speech`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(timeoutMs, budget)),
    });
    if (!res.ok) throw new Error(`speech API HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/pcm|octet-stream/i.test(contentType)) throw new Error(`speech API returned ${contentType}, expected raw PCM`);
    const { sampleRate, channels } = pcmFormat(contentType);
    const pcm = toMono(Buffer.from(await res.arrayBuffer()), channels);
    if (pcm.byteLength < 2) throw new Error("speech API returned no audio");
    return { pcm, sampleRate, model };
  },
};
