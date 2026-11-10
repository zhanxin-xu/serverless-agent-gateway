/**
 * What a module is (docs/modules.md), after DeepSeek Harness's plugins: a
 * module declares everything about itself — its tools, the prompt section
 * that explains them, its settings, what it needs — and the gateway collects
 * it from the deployment's composition (src/composition.ts). Nothing outside the module names it.
 *
 *   Module ──uses──▶ Capability ──selects one──▶ Provider
 *
 * A capability is the kind of outside service behind a module (web search,
 * speech…) with one interface; a provider is one service implementing it
 * (DeepSeek, Exa…), with its own settings. One provider per capability is in
 * use at a time, so switching providers never changes the tools the model sees.
 *
 *   dsh plugin          here
 *   name                id
 *   inject              requires (modules), capability (the service it uses)
 *   Config              config (its settings, with defaults; the catalog collects them)
 *   apply(ctx) → ctx.tools.register / ctx.systemPrompt.section
 *                       tools, section
 */
import type { PromptSectionContext } from "../prompt/types.js";
import type { SettingDef, SettingGroup } from "../settings/catalog.js";
import type { Tool } from "./tool.js";

export type Readiness = { ok: true } | { ok: false; reason: string };
export const READY: Readiness = { ok: true };
export const notReady = (reason: string): Readiness => ({ ok: false, reason });

/** What's left to spend on a service, for the model and for the console. */
export interface Balance {
  /** What the model reads (sent as JSON). */
  report: Record<string, unknown>;
  /** The console's tile: a headline, a line under it, and how much of a limit is used (0–1). */
  tile: { value: string; detail?: string; used?: number };
}

/**
 * Settings that travel with a module or a provider: one group, and its
 * settings (their `group` is the group's id). The catalog (src/settings)
 * collects them and tags the group with its module, or provider.
 */
export interface ConfigDecl {
  group: Omit<SettingGroup, "module" | "provider">;
  settings: SettingDef[];
}

export interface Module {
  /** Unique and stable: stored in chat settings and quotas, so never renamed. */
  id: string;
  label: string;
  summary: string;
  /** Always on, in every chat: no switch, not in a chat's switches. */
  core?: true;
  /** A step of its own in the setup guide (the chat model): the guide asks for its settings until it's ready. */
  setup?: "required";
  /** Modules that must be on for this one to be (generate_image needs the workspace to save and send). */
  requires?: string[];
  /** The service behind it; a module without one is on when `ready` says so (or always). */
  capability?: Capability<unknown>;
  /**
   * Its own settings. An optional module also gets a switch, MODULE_<ID>,
   * added to this group by the catalog.
   */
  config?: ConfigDecl;
  /** Extra condition, settings only, no network. */
  ready?(): Readiness;
  tools: Tool[];
  /** Explains the tools; part of the system prompt while the module is on (src/prompt). */
  section?: {
    /** Where it goes among the modules' sections: within ORDER.modules (src/prompt/order.ts), unique. */
    order: number;
    text(ctx: PromptSectionContext): string;
  };
  /**
   * The daily quota a chat can set for it: each successful call of `tools`
   * adds one to counter `key` (in gateway.usage_daily), and once a chat's
   * quota is reached they're refused. A key, once used, is never renamed.
   */
  meter?: { key: string; label: string; tools: string[] };
  /** What's left to spend on its service; undefined when the service in use can't tell. */
  balance?(): Promise<Balance> | undefined;
  /** A real call to its service, for the console's "check" button: a line saying what worked, or a throw. */
  check?(): Promise<string>;
}

export interface Capability<Impl> {
  id: string;
  label: string;
  /** The setting holding the chosen provider id; unset, the one that's configured is used. */
  selectionSetting: string;
  /** The deployment's providers for it (providersOf in capability.ts). */
  readonly providers: Provider<Impl>[];
  /** Its data lives with the provider, so switching providers loses sight of it (docs/design/modules.md 9.6). */
  stateful?: true;
}

export interface Provider<Impl> {
  /** Unique within its capability; what the selection setting holds. */
  id: string;
  /** The capability it implements (Capability.id). The deployment's composition lists it (src/composition.ts). */
  capability: string;
  /** Its settings; the group's label and help are its name and description in the console. */
  config: ConfigDecl;
  /** Whether its settings are filled in. Settings only, no network, so choosing is fast and certain. */
  available(): Readiness;
  /** The client. Cheap: called for each use. */
  create(): Impl;
  /**
   * The credential its calls are billed to (its API key), when it has one:
   * compared to tell when two modules' providers spend from the same key
   * (src/modules/balance.ts), never shown or sent anywhere.
   */
  billedTo?(): string | undefined;
}

export const providerLabel = (p: Provider<unknown>) => p.config.group.label;
