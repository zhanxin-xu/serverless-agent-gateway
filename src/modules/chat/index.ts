/** Talking and hanging up: the core every chat has. */
import { persona } from "../../composition.js";
import type { Module } from "../types.js";
import { CONFIG } from "./settings.js";
import { chatGuide } from "./guide.js";
import { chatMembers, endTurn, sendMessage, sendSticker } from "./tools.js";

/** Called once by compose() (src/composition.ts), after every file has loaded and the persona is in place. */
export function chatModule(): Module {
  const who = persona();
  return {
    id: "chat",
    label: "聊天",
    summary: "发消息、发表情包、查群成员、结束一轮。每个聊天都有。",
    core: true,
    config: CONFIG,
    // Stickers are the persona's; one without them has no send_sticker.
    tools: [sendMessage, ...(who.stickers ? [sendSticker(who.name, who.stickers)] : []), endTurn, chatMembers],
    section: { order: 5000, text: chatGuide },
  };
}
