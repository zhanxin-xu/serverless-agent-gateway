/**
 * The parameters every tool that talks shares (send_message, send_sticker,
 * send_voice, send_file…): which message to quote, and whether to show the quote.
 * Any module's talking tool uses these, so they live here rather than in one module.
 */
/** Shared `reply_to` parameter of the tools that talk (send_message, send_sticker, send_file). */
export const REPLY_TO = {
  type: "integer",
  description:
    "The message you want to quote: the N of its 第N条 label, used with quote: true. " +
    "Without a quote, leave it out: where the message goes is handled for you.",
};

export const replyTo = (args: Record<string, unknown>): number | undefined =>
  args.reply_to === undefined || args.reply_to === null || args.reply_to === "" ? undefined : Number(args.reply_to);

/** Shared `quote` parameter of the tools that talk. */
export const QUOTE = {
  type: "boolean",
  description:
    "Show this as a quote of the message it replies to (the reply_to one), so everyone sees what you're answering. " +
    "Use it when that isn't obvious: a busy group, an older message, or several people talking at once. Default false.",
};

/** The send options a talking tool's arguments ask for. */
export const sendOptions = (args: Record<string, unknown>) => ({ quote: args.quote === true });
