/**
 * 大肥鱼: who the bot is, everything about her that isn't how a tool works.
 * A deployment puts her in its composition (src/composition.ts, Persona), and
 * modules read her from there (her name, looks, picture, voice, stickers, how
 * she acts with their tools) instead of spelling them out, so another persona
 * is another folder here.
 *
 *   prompt.ts    who she is: the first section of the system prompt
 *   examples.ts  how she acts with each module's tools (shown while that module is on)
 *   stickers.ts  her sticker set
 */
import type { Persona } from "@gateway/core";
import { EXAMPLES } from "./examples.js";
import { PERSONA_PROMPT } from "./prompt.js";
import { STICKER_BASE_URL, STICKERS } from "./stickers.js";

export const dafeiyu: Persona = {
  name: "大肥鱼",
  prompt: PERSONA_PROMPT,
  examples: EXAMPLES,
  // What must stay the same whatever the pose, scene or outfit (image models read English best).
  appearanceForImages: "her face, light-blue long hair with the ahoge, whale-fin ears, whale hair clip and blue eyes",
  picture: "assets/persona/dafeiyu.webp",
  voice: {
    clip: "assets/voice/dafeiyu.mp3",
    transcript: "嘿嘿，本鱼来啦！我是大肥鱼，住在深海里的小鲸鱼～有什么问题尽管问我，答对了要请我吃小鱼干哦！",
  },
  stickers: { set: STICKERS, baseUrl: STICKER_BASE_URL },
};
