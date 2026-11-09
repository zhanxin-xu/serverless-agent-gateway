/**
 * Choosing a capability's provider (docs/design/modules.md 6.2), the way
 * DeepSeek Harness's web service does: never by load order.
 *
 *   chosen and usable           → it
 *   chosen but no such provider → off: "X doesn't exist"
 *   chosen but not configured   → off: why
 *   none chosen, one usable     → it
 *   none chosen, none usable    → off: nothing configured
 *   none chosen, several usable → off: choose one
 */
import { settingValue } from "../config.js";
import { providerLabel, type Capability, type Provider, type Readiness } from "./types.js";

export type Selection<Impl> = { ok: true; provider: Provider<Impl> } | { ok: false; reason: string };

export function select<Impl>(capability: Capability<Impl>): Selection<Impl> {
  const chosen = settingValue(capability.selectionSetting);
  if (chosen) {
    const provider = capability.providers.find((p) => p.id === chosen);
    if (!provider) return { ok: false, reason: `${capability.selectionSetting} 选的是 ${chosen}，但没有这个实现` };
    const ready = provider.available();
    return ready.ok ? { ok: true, provider } : { ok: false, reason: `${providerLabel(provider)}：${ready.reason}` };
  }
  const usable = capability.providers.filter((p) => p.available().ok);
  if (usable.length === 1) return { ok: true, provider: usable[0]! };
  if (!usable.length) {
    // With a single provider, its own reason says what's missing.
    const only = capability.providers.length === 1 ? capability.providers[0]! : undefined;
    const why = only?.available();
    return { ok: false, reason: why && !why.ok ? why.reason : `还没有配置任何${capability.label}` };
  }
  return { ok: false, reason: `有 ${usable.length} 个可用的${capability.label}（${usable.map(providerLabel).join("、")}），请在配置页选一个` };
}

/** The selected provider's client; throws when the capability is off (callers run only while their module is on). */
export function use<Impl>(capability: Capability<Impl>): Impl {
  const selection = select(capability);
  if (!selection.ok) throw new Error(selection.reason);
  return selection.provider.create();
}

export const readiness = (selection: Selection<unknown>): Readiness => (selection.ok ? { ok: true } : { ok: false, reason: selection.reason });
