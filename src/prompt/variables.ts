/**
 * Facts a section can name as {{variable}} instead of spelling out, so each is
 * defined once. Filled in when the prompt is put together; a {{name}} that
 * isn't defined here is an error, so a broken prompt never reaches the model.
 */
import { persona } from "../composition.js";

export const VARIABLES: Record<string, () => string> = {
  /** What she calls herself, and what the chat calls her: the composed persona's name. */
  bot_name: () => persona().name,
};

/** Fill in every {{name}}; throws on one that isn't defined. */
export function interpolate(text: string, where: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = VARIABLES[name];
    if (!value) throw new Error(`system prompt section ${where} uses {{${name}}}, which isn't defined (src/prompt/variables.ts)`);
    return value();
  });
}
