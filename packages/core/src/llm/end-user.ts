/**
 * Who a model call answers, as the provider sees it (OpenAI's safety_identifier,
 * OpenRouter's user…): `{channel}.{chat}.{person}`, the chat and the person as
 * 16 hex of a SHA-256. Stable, so a provider that flags misuse can act on one
 * person instead of the whole account; opaque to it; and ours to trace back:
 *
 *   - the chat part is left(encode(sha256(chat::bytea), 'hex'), 16) of a gateway.events.chat;
 *   - every step/start event records the id its call carried (data ->> 'endUser'),
 *     next to the messages of the person it answered.
 */
import { createHash } from "node:crypto";

const short = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

const channelOf = (chatKey: string) => chatKey.slice(0, chatKey.indexOf(":")) || chatKey;

/** The chat's part of its end-user ids, `{channel}.{chat}`: what the console finds a chat by. */
export const chatRef = (chatKey: string): string => `${channelOf(chatKey)}.${short(chatKey)}`;

/** `person`: their platform id, else how the chat shows them. The same person in another chat gets another id. */
export function endUserId(chatKey: string, person: string): string {
  return `${chatRef(chatKey)}.${short(`${channelOf(chatKey)}:${person}`)}`;
}
