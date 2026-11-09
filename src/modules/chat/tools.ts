/** Talking and hanging up: send_message, send_sticker, end_turn, chat_members, and the reply rules they share. */
import { config, settingValue } from "../../config.js";
import type { Persona } from "../../composition.js";
import { QUOTE, REPLY_TO, replyTo, sendOptions } from "../shared/reply.js";
import type { Tool } from "../tool.js";

export const sendMessage: Tool = {
  name: "send_message",
  role: "say",
  description:
    "Send one chat message right now. This is how your words reach the chat: each call is a separate message, " +
    "so call it several times to send a few short messages in a row. " +
    "Sending doesn't end your turn: when you're done, call end_turn, ideally in the same step as your last message.",
  parameters: {
    type: "object",
    properties: { text: { type: "string", description: "The message text (plain text)." }, reply_to: REPLY_TO, quote: QUOTE },
    required: ["text"],
  },
  async run(args, ctx) {
    const text = String(args.text ?? "").trim();
    if (!text) throw new Error("text is empty");
    return `${await ctx.send({ kind: "text", text }, replyTo(args), sendOptions(args))}. If you're done, call end_turn (in the same step as your last message).`;
  },
};

/** How a sticker reads as text: in the chat's history, and where images can't be sent. */
const stickerLabel = (name: string) => `[表情包：${name}]`;

/** send_sticker, offering the persona's stickers (made when the module is, src/composition.ts). */
export function sendSticker(who: string, stickers: NonNullable<Persona["stickers"]>): Tool {
  const names = Object.keys(stickers.set);
  return {
    name: "send_sticker",
    role: "talk",
    description:
      `Send one ${who} sticker (an image) right now, as its own message (it counts as a reply like send_message). Pick by mood:\n` +
      names.map((n) => `- ${n}：${stickers.set[n]!.when}`).join("\n"),
    parameters: {
      type: "object",
      properties: { name: { type: "string", enum: names, description: "Sticker name." }, reply_to: REPLY_TO, quote: QUOTE },
      required: ["name"],
    },
    async run(args, ctx) {
      const name = String(args.name ?? "");
      const sticker = Object.hasOwn(stickers.set, name) ? stickers.set[name] : undefined;
      if (!sticker) throw new Error(`unknown sticker "${name}"`);
      const base = (settingValue("STICKER_BASE_URL") || stickers.baseUrl).replace(/\/+$/, "");
      return `${await ctx.send({ kind: "image", url: `${base}/${sticker.file}`, label: stickerLabel(name) }, replyTo(args), sendOptions(args))}. If you're done, call end_turn (in the same step as your last message).`;
    },
  };
}

/** Most people chat_members lists. */
const MAX_MEMBERS = 50;

export const chatMembers: Tool = {
  name: "chat_members",
  description:
    "Who has been in this chat lately: everyone who wrote or was @-mentioned in the conversation you can still see, " +
    "most recently seen first, as \"nickname #ID\" with when they were last seen. QQ doesn't give bots the member list, " +
    "so people who never spoke aren't here. Use it to find someone's #ID, e.g. to @ them: write @#ID in send_message.",
  parameters: { type: "object", properties: {} },
  run(_args, ctx) {
    const people = ctx.people();
    if (!people.length) return "nobody yet";
    const when = new Intl.DateTimeFormat("zh-CN", {
      timeZone: config.agent.timezone,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const lines = people.slice(0, MAX_MEMBERS).map((p) => `${p.name ? `${p.name} ` : ""}${p.id}（最后出现 ${when.format(p.lastSeen)}）`);
    const more = people.length > MAX_MEMBERS ? `\n……还有 ${people.length - MAX_MEMBERS} 人` : "";
    return `${people.length} 人：\n${lines.join("\n")}${more}`;
  },
};

/** The model's way to hang up; the loop ends the turn when it sees this call (see agent/loop.ts). */
export const END_TURN = "end_turn";

export const endTurn: Tool = {
  name: END_TURN,
  role: "hangup",
  description:
    "Hang up: end this turn. Call it once you've said everything, in the same step as your last " +
    "send_message so no extra round is needed. Don't call it while you still need to look something up " +
    "or run something whose result you need to see: tools called in the same step still run, but you won't see their results.",
  parameters: { type: "object", properties: {} },
  run: () => "turn ended",
};
