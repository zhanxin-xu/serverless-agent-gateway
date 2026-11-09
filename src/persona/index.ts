/**
 * Who the bot is, in one place: everything about her that isn't how a tool
 * works. Modules read these facts (her name, what she looks like, her picture,
 * her voice, her stickers, how she acts with their tools) instead of spelling
 * them out, so another persona is a change in this folder only.
 *
 * Pure data, no imports of code: settings defaults read it too.
 *
 *   prompt.ts    who she is: the first section of the system prompt
 *   examples.ts  how she acts with each module's tools (shown while that module is on)
 *   stickers.ts  her sticker set
 */
export { PERSONA_PROMPT } from "./prompt.js";
export { EXAMPLES } from "./examples.js";
export { DEFAULT_STICKER_BASE_URL, isStickerName, STICKER_NAMES, STICKERS, stickerUrl, type StickerName } from "./stickers.js";

export const persona = {
  /** What she calls herself, and what the chat calls her ({{bot_name}} in prompt sections). */
  name: "大肥鱼",
  /**
   * Her looks, for an image model drawing her from her picture (it reads
   * English best): what must stay the same whatever the pose, scene or outfit.
   */
  appearanceForImages: "her face, light-blue long hair with the ahoge, whale-fin ears, whale hair clip and blue eyes",
  /** Her picture, a file in the deployment: the image module's default reference for drawing her. */
  picture: "assets/persona/dafeiyu.webp",
  /** A short clip of her talking, and what it says: the speech module's default voice to clone. */
  voice: {
    clip: "assets/voice/dafeiyu.mp3",
    transcript: "嘿嘿，本鱼来啦！我是大肥鱼，住在深海里的小鲸鱼～有什么问题尽管问我，答对了要请我吃小鱼干哦！",
  },
};
