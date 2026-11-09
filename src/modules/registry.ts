/**
 * Every module, and which of them are on.
 *
 * Add a module by writing it in its own folder (src/modules/<id>/index.ts: its
 * tools, the prompt section that explains them, its capability and providers)
 * and listing it here. The system prompt, the chats' switches, quotas,
 * balances and the console follow from the list.
 *
 * A module is on when its capability has a usable provider (capability.ts),
 * its own `ready` says so, every module it requires is on, and (for a chat)
 * the chat hasn't turned it off.
 */
import { basicsModule } from "./basics/index.js";
import { readiness, select } from "./capability.js";
import { chatModule } from "./chat/index.js";
import { imageModule } from "./image/index.js";
import { memoryModule } from "./memory/index.js";
import { modelModule } from "./model/index.js";
import { sandboxModule } from "./sandbox/index.js";
import { searchModule } from "./search/index.js";
import type { Tool, ToolContext, ToolRole } from "./tool.js";
import type { Module, ModuleId, Readiness } from "./types.js";
import { voiceModule } from "./voice/index.js";

/** In the order their tools and prompt sections appear. */
export const MODULES: readonly Module[] = [chatModule, basicsModule, modelModule, memoryModule, searchModule, sandboxModule, imageModule, voiceModule];

/** The modules a chat can turn off. */
export const OPTIONAL_MODULES = MODULES.filter((m) => !m.core);

export const moduleById = (id: string): Module | undefined => MODULES.find((m) => m.id === id);

/** Whether a module could be on (configured, its requirements met), ignoring any chat's switches. */
export function moduleStatus(module: Module, off: ReadonlySet<string> = new Set()): Readiness {
  if (off.has(module.id)) return { ok: false, reason: "这个聊天关掉了" };
  if (module.capability) {
    const selected = readiness(select(module.capability));
    if (!selected.ok) return selected;
  }
  const own = module.ready?.();
  if (own && !own.ok) return own;
  for (const id of module.requires ?? []) {
    const required = moduleById(id);
    const status = required ? moduleStatus(required, off) : { ok: false as const, reason: "" };
    if (!status.ok) return { ok: false, reason: `需要先开启${required?.label ?? id}${status.reason ? `（${status.reason}）` : ""}` };
  }
  return { ok: true };
}

/** The modules that are on, given the modules a chat turned off. */
export const activeModules = (off: ReadonlySet<string> = new Set()): Module[] => MODULES.filter((m) => moduleStatus(m, off).ok);

const toolsOf = (modules: Module[]): Tool[] => modules.flatMap((m) => m.tools.filter((t) => t.enabled?.() ?? true));

/** Every tool on offer, no chat's switches: for health checks, scripts and tests. */
export const activeTools = (): Tool[] => toolsOf(activeModules());

/** The module a tool belongs to, by its name now or one it used to have (old events name tools as they were). */
export function moduleOfTool(name: string): Module | undefined {
  return MODULES.find((m) => m.tools.some((t) => t.name === name) || m.aliases?.includes(name));
}

/**
 * A chat's rules for its tools (src/chats builds them from the chat's
 * profile and quotas). The registry doesn't know why a tool is refused.
 */
export interface ToolPolicy {
  /** Modules turned off in this chat: their tools and prompt sections are left out. */
  disabled?: ReadonlySet<string>;
  /** Asked before a tool runs; a message here is returned to the model as the error instead. */
  refuse?(tool: Tool, module: Module | undefined): string | undefined;
  /** Told after a tool ran and didn't fail. */
  ran?(tool: Tool, module: Module | undefined): void;
}

/** The modules and tools one turn offers, after the chat's policy. */
export class Toolset {
  readonly modules: Module[];
  readonly tools: Tool[];

  constructor(private policy: ToolPolicy = {}) {
    this.modules = activeModules(policy.disabled);
    this.tools = toolsOf(this.modules);
  }

  has(name: string): boolean {
    return this.tools.some((t) => t.name === name);
  }

  /** The `tools` of a Responses API request. */
  definitions() {
    return this.tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters }));
  }

  /** Names of the tools with one of these roles. */
  names(...roles: ToolRole[]): Set<string> {
    return new Set(this.tools.filter((t) => t.role && roles.includes(t.role)).map((t) => t.name));
  }

  /** The "say" tool: what the last step of a turn must call. */
  say(): string {
    const [name] = this.names("say");
    if (!name) throw new Error('no active tool has role "say"');
    return name;
  }

  async run(name: string, rawArgs: string, ctx: ToolContext): Promise<string> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) return `Error: unknown tool "${name}"`;
    const module = moduleOfTool(name);
    const refused = this.policy.refuse?.(tool, module);
    if (refused) return `Error: ${refused}`;
    let output: string;
    try {
      const args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
      output = await tool.run(args, ctx);
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
    if (!output.startsWith("Error:")) this.policy.ran?.(tool, module);
    return output;
  }
}

/** How a successful call of tool `name` with these (JSON) arguments read in the chat; undefined for tools that don't deliver. */
export function historyLine(name: string, rawArgs: string): string | undefined {
  const tool = moduleOfTool(name)?.tools.find((t) => t.name === name);
  if (!tool?.historyLine) return undefined;
  try {
    return tool.historyLine(rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {});
  } catch {
    return undefined;
  }
}

/** Every active tool, no chat policy: for health checks, scripts and tests. */
export const runTool = (name: string, rawArgs: string, ctx: ToolContext) => new Toolset().run(name, rawArgs, ctx);

export type { ModuleId };
