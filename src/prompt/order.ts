/**
 * Where each section of the system prompt goes. Lower comes first; gaps are
 * left so a section can be added without renumbering. The core sections are
 * placed here; each module places its own section within `modules`
 * (Module.section.order, unique, checked when the modules load).
 *
 * The order never depends on the chat or the turn, so the same chat with the
 * same settings gets the same prompt, byte for byte (the provider's prompt
 * cache depends on it).
 */
export const ORDER = {
  /** Who she is: identity, looks, personality, how she talks, limits (src/persona). */
  persona: 0,
  /** How a turn goes and what she sees; names no tools. */
  rules: 1000,
  /** Private chat or group. */
  scene: 2000,
  /** The channel's formatting note (ChannelAdapter.promptHint). */
  channel: 3000,
  /** The modules' sections, one per module that's on: each module picks its place in this range. */
  modules: { from: 5000, to: 7999 },
  /** The persona's examples for the modules that are on (src/persona/examples.ts). */
  examples: 8000,
  /** The chat's own extra instructions, set in the console: last, so they win. */
  chatExtra: 9000,
} as const;
