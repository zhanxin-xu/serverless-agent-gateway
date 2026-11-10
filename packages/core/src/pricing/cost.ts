/**
 * What a call cost. A provider reports what it knows (CallUsage): what the
 * service billed, when it says, and the tokens; the core fills in the rest
 * from the price table (catalog.ts) by the model's name. So a provider never
 * keeps prices of its own, and every call is priced the same way.
 *
 *   billed by the service   → that, converted to USD
 *   tokens, model in table  → tokens × the matching tier's rates
 *   neither                 → 0, marked unpriced
 */
import { prices } from "../composition.js";
import { settingValue } from "../config.js";
import { compileCatalog, findEntry, tierFor, type Currency, type PriceCatalog, type PriceEntry, type RateKey } from "./catalog.js";

/** Tokens of one call, as the service counts them. */
export interface TokenUsage {
  /** Input tokens not read from or written to the cache (all of them, where images aren't counted apart). */
  input: number;
  /** Of the uncached input, the image tokens, where the service counts them apart. */
  inputImage?: number;
  output: number;
  /** Input tokens read from the cache. */
  cacheRead?: number;
  /** Of those, the image tokens. */
  cacheReadImage?: number;
  /** Input tokens written to the cache (a short-lived cache: 5 minutes). */
  cacheWrite?: number;
  /** Written to a 1-hour cache. */
  cacheWrite1h?: number;
  /** Reasoning tokens, already counted in `output`. */
  reasoning?: number;
}

/** What one call used, as its provider reports it. */
export interface CallUsage {
  /** The model the call went to: what the table's patterns are matched against. */
  model: string;
  /** What the service billed for it, when it says so. */
  billed?: { amount: number; currency: Currency };
  tokens?: TokenUsage;
  /** The service tier the call ran at, where it matters to the price. */
  serviceTier?: string;
}

export interface CallCost {
  /** USD. */
  total: number;
  /** USD per part (priced from the table; a billed amount is all `total`). */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  by: "provider" | "price table" | "unpriced";
  /** The table entry and tier it was priced by. */
  entry?: string;
  tier?: string;
}

const NONE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** USD for an amount in `currency`. */
export function toUsd(amount: number, currency: Currency): number {
  if (currency === "USD") return amount;
  const rate = Number(settingValue("PRICE_CNY_PER_USD"));
  return rate > 0 ? amount / rate : 0;
}

let compiled: { from: PriceCatalog | undefined; entries: ReturnType<typeof compileCatalog>["entries"] } | undefined;

/** The deployment's price table, compiled once (Composition.prices). */
function entries() {
  const catalog = prices();
  if (compiled && compiled.from === catalog) return compiled.entries;
  const { entries, rejected } = catalog ? compileCatalog(catalog) : { entries: [], rejected: [] };
  for (const r of rejected) console.warn(`[pricing] entry ${r.id} left out: its pattern isn't a JavaScript regex (${r.error})`);
  compiled = { from: catalog, entries };
  return entries;
}

/** The table's entry for a model, if any (for the console). */
export const priceEntry = (model: string): PriceEntry | undefined => findEntry(entries(), model);

/** What a call cost, in USD. `at`: when it started. */
export function costOf(usage: CallUsage, at = Date.now()): CallCost {
  if (usage.billed) return { ...NONE, total: toUsd(usage.billed.amount, usage.billed.currency), by: "provider" };
  const tokens = usage.tokens;
  const entry = tokens ? findEntry(entries(), usage.model) : undefined;
  if (!tokens || !entry || entry.unit !== "mtok") return { ...NONE, total: 0, by: "unpriced" };
  const tier = tierFor(entry, {
    inputTokens: tokens.input + (tokens.inputImage ?? 0) + (tokens.cacheRead ?? 0) + (tokens.cacheReadImage ?? 0) + (tokens.cacheWrite ?? 0) + (tokens.cacheWrite1h ?? 0),
    at,
    serviceTier: usage.serviceTier,
    reasoning: (tokens.reasoning ?? 0) > 0,
  });
  // A rate the tier doesn't list falls back to the nearest one it does.
  const rate = (...keys: RateKey[]) => keys.map((k) => tier.rates[k]).find((r) => r !== undefined) ?? 0;
  const usd = (n: number | undefined, perMillion: number) => toUsd(((n ?? 0) * perMillion) / 1_000_000, entry.currency);
  const parts = {
    input: usd(tokens.input, rate("input")) + usd(tokens.inputImage, rate("input_image", "input")),
    output: usd(tokens.output, rate("output")),
    cacheRead: usd(tokens.cacheRead, rate("cache_read", "input")) + usd(tokens.cacheReadImage, rate("cache_read_image", "cache_read", "input_image", "input")),
    cacheWrite: usd(tokens.cacheWrite, rate("cache_write_5m", "input")) + usd(tokens.cacheWrite1h, rate("cache_write_1h", "cache_write_5m", "input")),
  };
  return { ...parts, total: parts.input + parts.output + parts.cacheRead + parts.cacheWrite, by: "price table", entry: entry.id, tier: tier.name };
}
