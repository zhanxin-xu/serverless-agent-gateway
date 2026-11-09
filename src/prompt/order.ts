/**
 * Where each section of the system prompt goes, in one place, with gaps left
 * so a section can be added without renumbering. Lower comes first.
 *
 * The order never depends on the chat or the turn, so the same chat with the
 * same settings gets the same prompt, byte for byte (the provider's prompt
 * cache depends on it).
 */
export const ORDER = {
  /** Who she is: identity, looks, personality, how she talks, limits. */
  persona: 0,
  /** How a turn goes and what she sees; names no tools. */
  rules: 1000,
  /** Private chat or group. */
  scene: 2000,
  /** The channel's formatting note (ChannelAdapter.promptHint). */
  channel: 3000,
  /** One section per module, explaining its tools. */
  module: {
    chat: 5000,
    basics: 5050,
    model: 5100,
    memory: 5200,
    search: 5300,
    sandbox: 5400,
    image: 5500,
    voice: 5600,
  },
  /** The chat's own extra instructions, set in the console: last, so they win. */
  chatExtra: 9000,
} as const;
