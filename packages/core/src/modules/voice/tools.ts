/**
 * send_voice: text → speech → a voice message, over whichever speech provider
 * is selected (capability.ts). The description teaches the provider's model
 * syntax (its dialect) and the singing recipe; the agent picks the voice,
 * speaking or singing, and the speed.
 */
import { use } from "../capability.js";
import { QUOTE, REPLY_TO, replyTo, sendOptions } from "../shared/reply.js";
import type { Tool } from "../tool.js";
import { speechCapability } from "./capability.js";

/** Long text makes a long, slow message; chat voice should be short. */
const MAX_TEXT_CHARS = 500;
const MIN_SPEED = 0.5;
const MAX_SPEED = 2;

const voiceIds = () => use(speechCapability).voices().map((v) => v.id);

function description(): string {
  const speech = use(speechCapability);
  return (
    "Say or sing something out loud: `text` becomes audio and is sent right now as a voice message " +
    "(it counts as a reply like send_message). Use it when a voice fits: they ask to hear you, a greeting, a joke, " +
    "a cheer, a short story, a few lines of a song. Not for every reply, and not for links, code, lists or long explanations " +
    "(send those as text). Keep it short. Write it the way it should sound: numbers, units and symbols as words, no emoji or markdown.\n\n" +
    `${speech.dialect().tool}\n\n` +
    "Voices (`voice`):\n" +
    speech
      .voices()
      .map((v) => `- ${v.about}`)
      .join("\n") +
    "\n\nSinging: `mode: \"sing\"`, lyrics in `text`, the style in `instructions` (\"温柔的摇篮曲\", \"摇滚，很有劲\"). " +
    "The tool adds each model's singing cues for you. It's a cappella with a melody the model makes up: a few lines, not a whole song. " +
    "Short lines, held notes marked with ～ (小星星～亮晶晶～). A public-domain tune can anchor the melody (\"用《小星星》的旋律\"). " +
    "Sing words you make up or that they wrote; for a well-known song, write your own playful words instead of its lyrics.\n\n" +
    "When it doesn't land (they say it sounds off, or like reading), try another voice or wording instead of resending the same thing."
  );
}

export const sendVoice: Tool = {
  name: "send_voice",
  role: "talk",
  get description() {
    return description();
  },
  get parameters() {
    const voices = voiceIds();
    return {
      type: "object",
      properties: {
        text: { type: "string", description: `What to say or sing (at most ${MAX_TEXT_CHARS} characters), in the chosen model's syntax.` },
        instructions: {
          type: "string",
          description: "Optional: the delivery of the whole message (\"困得迷迷糊糊\"), the singing style, or with voice \"none\" the character's voice.",
        },
        mode: { type: "string", enum: ["speak", "sing"], description: "speak (default) or sing `text` as lyrics." },
        voice: { type: "string", enum: voices, description: `Whose voice. Default ${voices[0]}.` },
        speed: { type: "number", minimum: MIN_SPEED, maximum: MAX_SPEED, description: "Optional speaking rate, 1 = normal (not every model honors it)." },
        reply_to: REPLY_TO,
        quote: QUOTE,
      },
      required: ["text"],
    };
  },
  async run(args, ctx) {
    const text = String(args.text ?? "").trim();
    if (!text) throw new Error("text is empty");
    if (text.length > MAX_TEXT_CHARS) throw new Error(`text is ${text.length} characters; keep a voice message under ${MAX_TEXT_CHARS}, send the rest as text`);

    const voices = voiceIds();
    const voice = args.voice === undefined || args.voice === null || args.voice === "" ? voices[0]! : String(args.voice);
    if (!voices.includes(voice)) throw new Error(`voice is one of ${voices.join(", ")}`);
    const mode = args.mode === undefined || args.mode === null || args.mode === "" ? "speak" : String(args.mode);
    if (mode !== "speak" && mode !== "sing") throw new Error('mode is "speak" or "sing"');
    let speed: number | undefined;
    if (args.speed !== undefined && args.speed !== null) {
      speed = Number(args.speed);
      if (!(speed >= MIN_SPEED && speed <= MAX_SPEED)) throw new Error(`speed is ${MIN_SPEED} to ${MAX_SPEED}`);
    }
    const left = ctx.callBudgetMs();
    if (left < 10_000) throw new Error("not enough time left in this function to make a voice message; the turn continues in a fresh function, try again there");

    const { pcm, sampleRate, model } = await use(speechCapability).speak({
      text,
      style: String(args.instructions ?? "").trim(),
      mode,
      voice,
      ...(speed !== undefined ? { speed } : {}),
      timeoutMs: left,
    });
    const seconds = (pcm.byteLength / 2 / sampleRate).toFixed(1);
    const status = await ctx.send({ kind: "voice", voice: { pcm, sampleRate, text } }, replyTo(args), sendOptions(args));
    const how = [mode === "sing" ? "sung" : "spoken", `model=${model}`, `voice=${voice}`, ...(speed !== undefined ? [`speed=${speed}`] : []), `${seconds}s`];
    return `${status} (voice message: ${how.join(", ")})`;
  },
};
