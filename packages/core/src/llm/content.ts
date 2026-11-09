/** Reading model messages: their text, their tool calls, their size. */
import type { AssistantMessage, ImageContent, ToolCall, Usage } from "./types.js";

/** What the model wrote as plain text (outside any tool call), trimmed. */
export function messageText(message: AssistantMessage): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

export function toolCalls(message: AssistantMessage): ToolCall[] {
  return message.content.filter((block): block is ToolCall => block.type === "toolCall");
}

/** The whole prompt of a call in tokens: what it read, cached or not. */
export const promptTokens = (usage: Usage): number => usage.input + usage.cacheRead + usage.cacheWrite;

/** An image as a data URL (how the store keeps it), and back. */
export const imageDataUrl = (image: ImageContent): string => `data:${image.mimeType};base64,${image.data}`;

export function imageFromDataUrl(url: string): ImageContent | undefined {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  return match ? { type: "image", mimeType: match[1]!, data: match[2]! } : undefined;
}
