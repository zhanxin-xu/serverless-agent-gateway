/**
 * Putting the system prompt together (docs/design/modules.md 5): the persona,
 * the rules, the scene, the channel's note, one section per module that's on
 * this turn, and the chat's own instructions, sorted by order (order.ts).
 *
 * The sections and the tool definitions come out of one call, from the same
 * Toolset: what the model is told it can do and what it's given are the same
 * thing. The runner, compaction, the console's preview and the tests all use
 * this, so they all see exactly what the model gets.
 */
import { MODULES, type Toolset } from "../modules/registry.js";
import { ORDER } from "./order.js";
import { PERSONA } from "./persona.js";
import { RULES, SCENE_RULES } from "./rules.js";
import type { PromptSection, PromptSectionContext } from "./types.js";
import { interpolate } from "./variables.js";

export interface AssemblyInput {
  chatType: "private" | "group";
  /** The channel's formatting note (ChannelAdapter.promptHint). */
  channelHint?: string;
  /** The chat's own instructions, from the console. */
  chatExtra?: string;
  /** The modules and tools this turn offers. */
  toolset: Toolset;
}

export interface AssembledSection {
  name: string;
  source: string;
  order: number;
  text: string;
}

export interface Assembly {
  /** In order; empty sections left out. */
  sections: AssembledSection[];
  /** The `tools` of the request. */
  tools: ReturnType<Toolset["definitions"]>;
  /** The sections joined: the request's `instructions`. */
  prompt: string;
}

/** Every section there is; each decides its own text for a turn. */
function sections(input: AssemblyInput): PromptSection[] {
  const fixed = (name: string, source: string, order: number, text: string | undefined): PromptSection => ({ name, source, order, text: () => text ?? "" });
  return [
    fixed("persona", "人设", ORDER.persona, PERSONA),
    fixed("rules", "业务规则", ORDER.rules, RULES),
    fixed("scene", input.chatType === "group" ? "场景：群聊" : "场景：私聊", ORDER.scene, SCENE_RULES[input.chatType]),
    fixed("channel", "渠道", ORDER.channel, input.channelHint),
    ...MODULES.flatMap((m): PromptSection[] =>
      m.section
        ? [
            {
              name: `module:${m.id}`,
              source: `模块：${m.label}`,
              order: m.section.order,
              // Only a module that's on this turn says anything.
              text: (ctx) => (input.toolset.modules.includes(m) ? m.section!.text(ctx) : ""),
            },
          ]
        : [],
    ),
    fixed("chat:extra", "这个聊天的额外设定", ORDER.chatExtra, input.chatExtra ? `# 这个聊天的额外设定\n\n${input.chatExtra}` : ""),
  ];
}

export function assemble(input: AssemblyInput): Assembly {
  const ctx: PromptSectionContext = { chatType: input.chatType, has: (tool) => input.toolset.has(tool) };
  const all = sections(input);
  const names = new Set<string>();
  for (const s of all) {
    if (names.has(s.name)) throw new Error(`two system prompt sections are named ${s.name}`);
    names.add(s.name);
  }
  const assembled = all
    .map((s) => ({ name: s.name, source: s.source, order: s.order, text: interpolate(s.text(ctx).trim(), s.name) }))
    .filter((s) => s.text)
    // Stable: equal orders keep the list's order, which never changes.
    .sort((a, b) => a.order - b.order);
  return {
    sections: assembled,
    tools: input.toolset.definitions(),
    prompt: assembled.map((s) => s.text).join("\n\n"),
  };
}
