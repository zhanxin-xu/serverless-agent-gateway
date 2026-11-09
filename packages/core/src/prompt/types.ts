/**
 * The system prompt is a list of named, ordered sections (docs/design/modules.md 5),
 * as in DeepSeek Harness: sorted by order, empty ones dropped, joined with a
 * blank line. Who writes each section and where it goes is in order.ts.
 */

/** What a section may look at to decide its text. */
export interface PromptSectionContext {
  chatType: "private" | "group";
  /** Whether the model is offered this tool this turn. A section only names tools that are. */
  has(tool: string): boolean;
}

export interface PromptSection {
  /** "persona", "rules", "module:memory"… Unique. */
  name: string;
  /** Who writes it, for people reading the console's preview: "人设", "模块：长期记忆"… */
  source: string;
  order: number;
  /** "" leaves it out. */
  text(ctx: PromptSectionContext): string;
}
