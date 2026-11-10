/**
 * The model price table (schema_version 1, resources/pricing/ in the repository):
 * the deployment hands it to compose() (Composition.prices); this file reads
 * it and finds the entry and the tier a call is priced by.
 *
 * Its format is documented with the data (resources/pricing/README.md). In
 * short: entries in order, the first whose `match` (a Python regex) finds the
 * model name wins; each has a default tier and conditional ones, the matching
 * conditional tier with the highest priority applies to the whole call, and a
 * conditional tier's missing rates are the default tier's.
 */

export type PriceUnit = "mtok" | "request" | "image" | "credit" | "second";
export type Currency = "USD" | "CNY";

/** Per million tokens (`mtok`), or per unit (`per_unit`). input_image / cache_read_image: image tokens of the input, where they're priced apart. */
export type RateKey = "input" | "input_image" | "output" | "cache_read" | "cache_read_image" | "cache_write_5m" | "cache_write_1h" | "per_unit";

export type PriceCondition =
  | { input_tokens: { gt?: number; gte?: number } }
  | { time_window: { tz: string; hours: string[]; weekdays?: number[] } }
  | { service_tier: { in: string[] } }
  | { reasoning: { used: boolean } };

export interface PriceTier {
  name: string;
  priority?: number;
  /** Absent: the default tier. All conditions must hold. */
  when?: PriceCondition[];
  rates: Partial<Record<RateKey, number>>;
  zero_reason?: string;
}

export interface PriceEntry {
  id: string;
  match: string;
  unit: PriceUnit;
  currency: Currency;
  tiers: PriceTier[];
  examples?: string[];
  source?: string;
  note?: string;
}

export interface PriceCatalog {
  schema_version: 1;
  updated_at?: string;
  models: PriceEntry[];
}

/** What a call's tier is chosen by. */
export interface PricingContext {
  /** Every input token, cached and cache writes included. */
  inputTokens: number;
  /** When the call started (epoch ms). */
  at: number;
  serviceTier?: string;
  reasoning: boolean;
}

interface Compiled {
  entry: PriceEntry;
  pattern: RegExp;
}

/**
 * The entries with their patterns compiled. The patterns are Python's: a leading
 * (?i) becomes the i flag; one that JavaScript can't compile is left out (npm
 * test checks the shipped table has none).
 */
export function compileCatalog(catalog: PriceCatalog): { entries: Compiled[]; rejected: Array<{ id: string; error: string }> } {
  const entries: Compiled[] = [];
  const rejected: Array<{ id: string; error: string }> = [];
  for (const entry of catalog.models) {
    try {
      entries.push({ entry, pattern: jsPattern(entry.match) });
    } catch (err) {
      rejected.push({ id: entry.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { entries, rejected };
}

export function jsPattern(python: string): RegExp {
  const insensitive = python.startsWith("(?i)");
  return new RegExp(insensitive ? python.slice(4) : python, insensitive ? "i" : "");
}

/** The first entry whose pattern finds `name` (re.search: anywhere in it). */
export function findEntry(entries: Compiled[], name: string): PriceEntry | undefined {
  return entries.find((c) => c.pattern.test(name))?.entry;
}

/** The tier a call is priced by, with the default tier's rates under a conditional tier's own. */
export function tierFor(entry: PriceEntry, ctx: PricingContext): { name: string; rates: Partial<Record<RateKey, number>> } {
  const base = entry.tiers.find((t) => !t.when?.length)!;
  const matched = entry.tiers
    .filter((t) => t.when?.length && t.when.every((c) => holds(c, ctx)))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  return matched ? { name: matched.name, rates: { ...base.rates, ...matched.rates } } : { name: base.name, rates: base.rates };
}

function holds(condition: PriceCondition, ctx: PricingContext): boolean {
  if ("input_tokens" in condition) {
    const { gt, gte } = condition.input_tokens;
    return (gt === undefined || ctx.inputTokens > gt) && (gte === undefined || ctx.inputTokens >= gte);
  }
  if ("service_tier" in condition) return ctx.serviceTier !== undefined && condition.service_tier.in.includes(ctx.serviceTier);
  if ("reasoning" in condition) return condition.reasoning.used === ctx.reasoning;
  return inWindow(condition.time_window, ctx.at);
}

/** Whether `at` falls in one of the hours (a span may cross midnight) on one of the weekdays (1 = Monday … 7 = Sunday), in that zone. */
function inWindow(window: { tz: string; hours: string[]; weekdays?: number[] }, at: number): boolean {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: window.tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday!) + 1;
  const toMinutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  return window.hours.some((span) => {
    const [from, to] = span.split("-").map(toMinutes) as [number, number];
    // A span crossing midnight counts for the day it starts on.
    if (from <= to) return (!window.weekdays || window.weekdays.includes(weekday)) && minute >= from && minute < to;
    const yesterday = weekday === 1 ? 7 : weekday - 1;
    return (
      ((!window.weekdays || window.weekdays.includes(weekday)) && minute >= from) ||
      ((!window.weekdays || window.weekdays.includes(yesterday)) && minute < to)
    );
  });
}
