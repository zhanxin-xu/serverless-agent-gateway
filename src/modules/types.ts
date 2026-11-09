/**
 * Modules, capabilities and providers (docs/design/modules.md).
 *
 *   Module ──uses──▶ Capability ──selects one──▶ Provider
 *
 * A module is what the model sees and a chat turns on or off: its tools, the
 * prompt section that explains them, its daily quota, its balance. A
 * capability is the kind of outside service behind a module (web search,
 * speech…) with one interface; a provider is one service implementing it
 * (DeepSeek, Exa…), with its own settings. One provider per capability is in
 * use at a time, so switching providers never changes the tools the model sees.
 */
import type { Tool } from "./tool.js";
import type { PromptSectionContext } from "../prompt/types.js";

/** Stable ids: stored in chat settings and quotas, so never renamed. */
export type ModuleId = "chat" | "basics" | "model" | "memory" | "search" | "sandbox" | "image" | "voice";

/** The daily counters a module can be metered by: the keys of gateway.usage_daily.counts. */
export type MeterKey = "images" | "voices" | "searches";

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

export interface Module {
  id: ModuleId;
  label: string;
  summary: string;
  /** Always on, in every chat; not in a chat's switches. */
  core?: true;
  /** Modules that must be on for this one to be (generate_image needs the workspace to save and send). */
  requires?: ModuleId[];
  /** The service behind it; a module without one is on when `ready` says so (or always). */
  capability?: Capability<unknown>;
  /** The settings group of the module itself (beside its provider's), shown in the console. */
  settings?: string;
  /** Extra condition, settings only, no network. */
  ready?(): Readiness;
  tools: Tool[];
  /** Explains the tools; part of the system prompt while the module is on (src/prompt). */
  section?: {
    /** Where it goes: an order from src/prompt/order.ts. */
    order: number;
    text(ctx: PromptSectionContext): string;
  };
  /**
   * The daily quota a chat can set for it: each successful call of `tools`
   * adds one to counter `key`, and once a chat's quota is reached they're
   * refused. `key` must be an existing usage counter (docs/design/modules.md 9.4).
   */
  meter?: { key: MeterKey; label: string; tools: string[] };
  /** What's left to spend on its service; undefined when the service in use can't tell. */
  balance?(): Promise<Balance> | undefined;
  /** A real call to its service, for the console's "check" button: a line saying what worked, or a throw. */
  check?(): Promise<string>;
}

export interface Capability<Impl> {
  id: string;
  label: string;
  /** The setting holding the chosen provider id; empty = choose automatically. */
  selectionSetting: string;
  providers: Provider<Impl>[];
  /** Its data lives with the provider, so switching providers loses sight of it (docs/design/modules.md 9.6). */
  stateful?: true;
}

export interface Provider<Impl> {
  id: string;
  label: string;
  /** What it suits and what it costs, for the console. */
  description: string;
  /** Its settings group. */
  settings: string;
  /** Whether its settings are filled in. Settings only, no network, so choosing is fast and certain. */
  available(): Readiness;
  /** The client. Cheap: called for each use. */
  create(): Impl;
}
