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
import { providers } from "../composition.js";
import { settingValue } from "../config.js";
import { moduleOfCapability, spendGate, type BudgetRefusal, BudgetUsedError } from "./spend.js";
import { providerLabel, type Capability, type Provider, type Readiness } from "./types.js";

/** The providers the deployment composed for a capability (src/composition.ts), in its order. */
export function providersOf<Impl>(capabilityId: string): Provider<Impl>[] {
  return providers().filter((p) => p.capability === capabilityId) as Provider<Impl>[];
}

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

/** A metered capability's spend gate: its module's budget, whichever provider serves it (src/modules/spend.ts). */
function gateOf<Impl>(capability: Capability<Impl>) {
  const m = capability.meter && moduleOfCapability(capability.id);
  return m ? spendGate(m.id) : undefined;
}

/**
 * The selected provider's client; throws when the capability is off (callers
 * run only while their module is on). A metered capability's client checks
 * and records each call against its module's budget.
 */
export function use<Impl>(capability: Capability<Impl>): Impl {
  const selection = select(capability);
  if (!selection.ok) throw new Error(selection.reason);
  const client = selection.provider.create();
  const gate = gateOf(capability);
  return gate ? capability.meter!(client, gate) : client;
}

/** The used-up budget of a metered capability's module, if any. */
export async function budgetRefusal<Impl>(capability: Capability<Impl>): Promise<BudgetRefusal | undefined> {
  try {
    await gateOf(capability)?.check();
    return undefined;
  } catch (err) {
    if (err instanceof BudgetUsedError) return err.refusal;
    throw err;
  }
}

export const readiness = (selection: Selection<unknown>): Readiness => (selection.ok ? { ok: true } : { ok: false, reason: selection.reason });
