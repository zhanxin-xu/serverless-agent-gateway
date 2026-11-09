/**
 * Which modules are on, and the tools a turn offers.
 *
 * The modules come from the list in src/modules/index.ts, checked here when
 * they load (unique ids, tools and prompt positions; known requirements;
 * meters on their own tools), so a mistake in a module's definition stops
 * the gateway from starting instead of showing up in a conversation.
 *
 * A module is on when its switch is on (optional modules: MODULE_<ID>), its
 * capability has a usable provider (capability.ts), its own `ready` says so,
 * every module it requires is on, and (for a chat) the chat hasn't turned it off.
 */
import { settingValue } from "../config.js";
import { ORDER } from "../prompt/order.js";
import { switchSetting } from "../settings/catalog.js";
import { readiness, select } from "./capability.js";
import { loadedModules } from "./index.js";
import type { Tool, ToolContext, ToolRole } from "./tool.js";
import type { Module, Readiness } from "./types.js";

/** Throws on the first thing wrong with the modules' definitions. */
export function checkModules(modules: readonly Module[]): void {
  const ids = new Set<string>();
  const tools = new Map<string, string>();
  const orders = new Map<number, string>();
  const meters = new Map<string, string>();
  for (const m of modules) {
    if (!/^[a-z][a-z0-9]*$/.test(m.id)) throw new Error(`module id "${m.id}": lowercase letters and digits only (it's in MODULE_<ID>)`);
    if (ids.has(m.id)) throw new Error(`two modules are called ${m.id}`);
    ids.add(m.id);
    for (const t of m.tools) {
      if (tools.has(t.name)) throw new Error(`tool ${t.name} is in both ${tools.get(t.name)} and ${m.id}`);
      tools.set(t.name, m.id);
    }
    if (m.section) {
      const { order } = m.section;
      if (order < ORDER.modules.from || order > ORDER.modules.to) throw new Error(`module ${m.id}: section order ${order} is outside ${ORDER.modules.from}–${ORDER.modules.to}`);
      if (orders.has(order)) throw new Error(`modules ${orders.get(order)} and ${m.id} both put their section at ${order}`);
      orders.set(order, m.id);
    }
    if (m.meter) {
      if (meters.has(m.meter.key)) throw new Error(`modules ${meters.get(m.meter.key)} and ${m.id} both count into ${m.meter.key}`);
      meters.set(m.meter.key, m.id);
      for (const name of m.meter.tools) if (!m.tools.some((t) => t.name === name)) throw new Error(`module ${m.id} meters ${name}, which isn't its tool`);
    }
    if (m.core && m.capability) throw new Error(`core module ${m.id} can't depend on a service that may be missing`);
  }
  for (const m of modules) for (const r of m.requires ?? []) if (!ids.has(r)) throw new Error(`module ${m.id} requires ${r}, which isn't loaded`);
}

/** The modules, in order (src/modules/index.ts), checked. */
export const MODULES = loadedModules();
checkModules(MODULES);

/** The modules a chat can turn off. */
export const OPTIONAL_MODULES = MODULES.filter((m) => !m.core);

export const moduleById = (id: string): Module | undefined => MODULES.find((m) => m.id === id);

export { switchSetting };

/** Whether the module's switch is on (always, for core modules). */
export function switchedOn(module: Module): boolean {
  const setting = switchSetting(module);
  return !setting || settingValue(setting) !== "off";
}

/** Whether a module could be on (configured, its requirements met), ignoring any chat's switches. */
export function moduleStatus(module: Module, off: ReadonlySet<string> = new Set()): Readiness {
  if (!switchedOn(module)) return { ok: false, reason: "已关闭" };
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

/** The module a tool belongs to. Tool names are stored in the event log, so they're never renamed. */
export function moduleOfTool(name: string): Module | undefined {
  return MODULES.find((m) => m.tools.some((t) => t.name === name));
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

/** Every active tool, no chat policy: for health checks, scripts and tests. */
export const runTool = (name: string, rawArgs: string, ctx: ToolContext) => new Toolset().run(name, rawArgs, ctx);

