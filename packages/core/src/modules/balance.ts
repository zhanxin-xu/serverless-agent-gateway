/**
 * What's left on the services the modules spend from, and which of them spend
 * from the same key.
 *
 * Keys belong to provider instances, not to vendors: the chat model and the
 * image model may use one OpenRouter key or two. Whether two modules share
 * one is told by the key itself (Provider.billedTo, compared as a hash),
 * never by who issued it.
 */
import { createHash } from "node:crypto";
import { activeModules, moduleById } from "./registry.js";
import { select } from "./capability.js";
import type { Balance, Capability, Module } from "./types.js";

/** The selected provider's balance, when it can tell; undefined while the capability is off or its provider can't. */
export function capabilityBalance<Impl extends { balance?(): Promise<Balance> }>(capability: Capability<Impl>): Promise<Balance> | undefined {
  const selection = select(capability);
  return selection.ok ? selection.provider.create().balance?.() : undefined;
}

/** Whether the provider in use can report a balance. */
export function canReportBalance<Impl extends { balance?(): Promise<Balance> }>(capability: Capability<Impl>): boolean {
  const selection = select(capability);
  return selection.ok && Boolean(selection.provider.create().balance);
}

/** The credential a module spends from now, as a fingerprint; undefined when it has none or is off. */
export function credentialOf(m: Module): string | undefined {
  if (!m.capability) return undefined;
  const selection = select(m.capability);
  const secret = selection.ok ? selection.provider.billedTo?.() : undefined;
  return secret ? createHash("sha256").update(secret).digest("hex") : undefined;
}

/** The modules that are on and report a balance, grouped by the key they spend from (one group per key). */
export function balanceGroups(): Module[][] {
  const groups = new Map<string, Module[]>();
  for (const m of activeModules()) {
    if (!m.balance) continue;
    const key = credentialOf(m) ?? `module:${m.id}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups.values()];
}

/** A module's balance as its tool reports it to the model (by the module's id), saying which other modules spend from the same key. */
export async function balanceReport(moduleId: string): Promise<string> {
  const m = moduleById(moduleId);
  const balance = m?.balance?.();
  if (!m) throw new Error(`no module ${moduleId}`);
  if (!balance) throw new Error(`the service ${m.label} uses can't report its balance`);
  const { report } = await balance;
  const shared = balanceGroups().find((group) => group.includes(m))?.filter((other) => other !== m) ?? [];
  return JSON.stringify(
    shared.length
      ? { ...report, same_key_as: shared.map((other) => other.label), note_on_sharing: "the same key: one limit and one usage for all of them" }
      : report,
  );
}
