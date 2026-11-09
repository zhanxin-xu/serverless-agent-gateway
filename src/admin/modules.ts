/**
 * The modules as the console shows them (src/modules): whether each is on and
 * why not, its providers and which is in use, its tools, quota and checks.
 */
import { settingValue } from "../config.js";
import { select } from "../modules/capability.js";
import { MODULES, moduleStatus, switchedOn, switchSetting } from "../modules/registry.js";
import type { Module } from "../modules/types.js";

export interface ModuleView {
  id: string;
  label: string;
  summary: string;
  core: boolean;
  requires: string[];
  /** Its switch (optional modules): the setting, and whether it's on. A module switched on may still be off: see `ok`. */
  switch: { setting: string; on: boolean } | null;
  /** On (switched on, configured, requirements met), ignoring any chat's switches. */
  ok: boolean;
  reason?: string;
  /** The module's own settings group. */
  settings: string | null;
  capability: {
    id: string;
    label: string;
    /** The setting that chooses the provider, its value ("" = automatic), and the provider in use. */
    setting: string;
    chosen: string;
    selected: string | null;
    stateful: boolean;
    providers: Array<{ id: string; label: string; description: string; settings: string; available: boolean; reason?: string }>;
  } | null;
  tools: Array<{ name: string; offered: boolean }>;
  meter: { key: string; label: string } | null;
  canCheck: boolean;
  hasBalance: boolean;
}

export function describeModule(m: Module): ModuleView {
  const status = moduleStatus(m);
  const capability = m.capability;
  const selection = capability ? select(capability) : undefined;
  const setting = switchSetting(m);
  return {
    id: m.id,
    label: m.label,
    summary: m.summary,
    core: Boolean(m.core),
    requires: m.requires ?? [],
    switch: setting ? { setting, on: switchedOn(m) } : null,
    ok: status.ok,
    ...(status.ok ? {} : { reason: status.reason }),
    settings: m.settings ?? null,
    capability: capability
      ? {
          id: capability.id,
          label: capability.label,
          setting: capability.selectionSetting,
          chosen: settingValue(capability.selectionSetting),
          selected: selection?.ok ? selection.provider.id : null,
          stateful: Boolean(capability.stateful),
          providers: capability.providers.map((p) => {
            const available = p.available();
            return {
              id: p.id,
              label: p.label,
              description: p.description,
              settings: p.settings,
              available: available.ok,
              ...(available.ok ? {} : { reason: available.reason }),
            };
          }),
        }
      : null,
    tools: m.tools.map((t) => ({ name: t.name, offered: status.ok && (t.enabled?.() ?? true) })),
    meter: m.meter ? { key: m.meter.key, label: m.meter.label } : null,
    canCheck: Boolean(m.check),
    hasBalance: Boolean(m.balance),
  };
}

export const describeModules = (): ModuleView[] => MODULES.map(describeModule);
