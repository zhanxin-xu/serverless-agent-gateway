/** Talking and hanging up: the core every chat has. */
import { ORDER } from "../../prompt/order.js";
import type { Module } from "../types.js";
import { chatGuide } from "./guide.js";
import { chatMembers, endTurn, sendMessage, sendSticker } from "./tools.js";

export const chatModule: Module = {
  id: "chat",
  label: "聊天",
  summary: "发消息、发表情包、查群成员、结束一轮。每个聊天都有。",
  core: true,
  tools: [sendMessage, sendSticker, endTurn, chatMembers],
  section: { order: ORDER.module.chat, text: chatGuide },
};
