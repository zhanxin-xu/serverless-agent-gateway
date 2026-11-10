// How a chat is named and shown, shared by the chat list and the chat page.
// Names and labels come from the server (GET chats / chat); only colors are decided here.
import { pill } from "./dom.js";

/** The color of each reply mode's pill. */
const MODE_COLORS = { normal: "ok", mention: "info", record: "mute", block: "bad" };

/** The chat's reply mode as a pill: "正常", "只回 @"…; "已关闭" when the chat is switched off. */
export const modePill = (c) => (c.enabled === false ? pill("bad", "已关闭") : pill(MODE_COLORS[c.mode] ?? "mute", c.modeLabel ?? c.mode));

/** "QQ 群", "Telegram 私聊". */
export const chatKind = (c) => `${c.channelLabel ?? c.channel}${c.chatType === "group" ? " 群" : c.chatType === "private" ? " 私聊" : ""}`;

/** "老王 #3B6834" → "老王"; a label without a name stays as its short id. */
const personName = (label) => label.replace(/ #[0-9A-Za-z?]{1,6}$/, "");

/** Who's been talking: "老王、阿青、小明 等". Where the platform gives no group name, this is how a group is recognized. */
export function speakersText(c) {
  const names = (c.speakers ?? []).map(personName);
  return names.length ? `${names.join("、")}${names.length >= 5 ? " 等" : ""}` : "";
}

/** A chat's name for people: its title; else, for a DM, the person; else a short form of its key (its last part). */
export function chatName(c) {
  if (c.profile?.title) return c.profile.title;
  if (c.chatType === "private" && c.speakers?.length) return c.speakers[0];
  const id = c.chat.split(":").at(-1);
  return id.length > 10 ? `${id.slice(0, 10)}…` : id;
}
