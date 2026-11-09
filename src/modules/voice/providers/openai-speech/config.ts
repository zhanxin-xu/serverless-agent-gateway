import { settingInt, settingJson, settingValue } from "../../../../config.js";
import { DEFAULT_VOICE_REFERENCE } from "./settings.js";

/** What the built-in voice clip says (TTS_REFERENCE_TEXT's default while that clip is used). */
const DEFAULT_VOICE_REFERENCE_TEXT = "嘿嘿，本鱼来啦！我是大肥鱼，住在深海里的小鲸鱼～有什么问题尽管问我，答对了要请我吃小鱼干哦！";

/** "none" turns a clip setting off. */
const clip = (name: string) => {
  const value = settingValue(name);
  return value.toLowerCase() === "none" ? "" : value;
};

/** POST {TTS_BASE_URL}/audio/speech. */
export const speechConfig = {
  get apiKey() {
    return settingValue("TTS_API_KEY");
  },
  get baseUrl() {
    return settingValue("TTS_BASE_URL").replace(/\/+$/, "");
  },
  /** The speech model (set here, not chosen by the agent). */
  get model() {
    return settingValue("TTS_MODEL");
  },
  /** The API's `voice` (a provider voice ID). Empty: the reference audio sets the voice. */
  get voice() {
    return settingValue("TTS_VOICE");
  },
  /** The voice to clone: a file in the deployment, or an https URL; "none" turns cloning off. */
  get referenceAudio() {
    return clip("TTS_REFERENCE_AUDIO");
  },
  /** What the reference audio says (helps the clone). Defaults to the built-in clip's words when that clip is used. */
  get referenceText() {
    return settingValue("TTS_REFERENCE_TEXT", this.referenceAudio === DEFAULT_VOICE_REFERENCE ? DEFAULT_VOICE_REFERENCE_TEXT : "");
  },
  /** Optional second clip of the same voice singing, offered to the model as voice "dafeiyu_sing". */
  get singReferenceAudio() {
    return clip("TTS_SING_REFERENCE_AUDIO");
  },
  /** What the singing clip sings. */
  get singReferenceText() {
    return settingValue("TTS_SING_REFERENCE_TEXT");
  },
  /** The API's `instructions`: a standing direction for every line, e.g. "软萌可爱的小女孩". The model can add its own. */
  get instructions() {
    return settingValue("TTS_INSTRUCTIONS");
  },
  /** Extra request body fields, e.g. {"speed":1.1} or {"provider":{"options":{...}}}. */
  get extraBody() {
    return settingJson("TTS_EXTRA_BODY");
  },
  get timeoutMs() {
    return settingInt("TTS_TIMEOUT_MS");
  },
};
