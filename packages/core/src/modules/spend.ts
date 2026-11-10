/**
 * Budgets per module: what the model, or drawing, may cost in a day and in a
 * month, in USD, across every chat, whichever provider serves it. Set in the
 * module's own settings, as {MODULE}_DAILY_BUDGET_USD and
 * {MODULE}_MONTHLY_BUDGET_USD; unset, no limit.
 *
 * A capability whose calls cost money says how to read a call's cost
 * (Capability.meter). use() (capability.ts) hands out its client through the
 * module's SpendGate: each call is refused once the budget is used up, and its
 * cost is added to the module's day (gateway.spend_daily) after it ends.
 *
 * What it can't do (docs/configuration.md#花费上限):
 *   - The cost is the provider's own figure where it reports one, else an
 *     estimate from the model's prices; a call that reports neither counts 0.
 *   - It's added after a call ends, so calls running at once can go over by
 *     what they cost.
 *   - It only sees calls made through the gateway: a leaked key is the
 *     provider's to limit.
 *
 * Days are UTC days, like each chat's quotas (chats/day.ts); months are UTC
 * months, so both reset at 08:00 Beijing time.
 */
import { beijingTime, nextDayStart, utcDay } from "../chats/day.js";
import { modules } from "../composition.js";
import { settingKey, settingValue } from "../config.js";
import type { SettingDef } from "../settings/catalog.js";
import { getStore, SchemaOutdatedError } from "../store/index.js";
import type { Module } from "./types.js";

/** What a metered capability's client calls through (Capability.meter). */
export interface SpendGate {
  /** The module spending. */
  readonly module: string;
  /** Throws BudgetUsedError when the module's budget is used up. */
  check(): Promise<void>;
  /** Add one call and what it cost (USD; 0 when unknown). Never throws. */
  record(costUsd: number): Promise<void>;
}

export interface BudgetRefusal {
  module: string;
  period: "day" | "month";
  /** USD. */
  limit: number;
  /** When it resets (epoch ms). */
  resetsAt: number;
}

/** A call refused because its module's budget is used up. */
export class BudgetUsedError extends Error {
  override name = "BudgetUsedError";
  constructor(readonly refusal: BudgetRefusal) {
    super(
      `the ${refusal.module} module's ${refusal.period === "day" ? "daily" : "monthly"} budget ($${refusal.limit}) is used up; ` +
        `it resets at ${beijingTime(refusal.resetsAt)}`,
    );
  }
}

const budgetKeys = (moduleId: string) => ({
  day: settingKey(moduleId, "daily_budget_usd"),
  month: settingKey(moduleId, "monthly_budget_usd"),
});

/** The budget settings the catalog adds to a metered module's own group. */
export function budgetSettings(moduleId: string, group: string): SettingDef[] {
  const keys = budgetKeys(moduleId);
  const help = "所有聊天加起来最多花多少美元，不管用的是哪个服务商；用完后拒绝调用，留空不限。金额是估算的，调用结束后才记账，可能略超。";
  return [
    { key: keys.day, group, label: "每日花费上限（美元）", kind: "number", min: 0, help: `${help}每天北京时间 08:00 重置。` },
    { key: keys.month, group, label: "每月花费上限（美元）", kind: "number", min: 0, help: `${help}每月 1 日北京时间 08:00 重置。` },
  ];
}

/** USD, or undefined when unset. */
function budgetOf(key: string): number | undefined {
  const raw = settingValue(key);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const budgetsOf = (moduleId: string) => {
  const keys = budgetKeys(moduleId);
  return { day: budgetOf(keys.day), month: budgetOf(keys.month) };
};

/** When the current UTC month ends (epoch ms). */
function nextMonthStart(ms = Date.now()): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

interface Spent {
  /** USD today and this month. */
  day: number;
  month: number;
  /** Calls today. */
  calls: number;
}

// Every module's spend this month, read at once and kept for CACHE_MS; this instance's own calls are added as they end.
const CACHE_MS = 15_000;
let cached: { at: number; day: string; byModule: Map<string, Spent> } | undefined;
let warned = false;

function warnOnce(err: unknown): void {
  if (warned) return;
  warned = true;
  const why = err instanceof SchemaOutdatedError ? "the database has no spend table yet" : err instanceof Error ? err.message : String(err);
  console.warn(`[spend] ${why}; spending isn't recorded and budgets don't apply`);
}

/** Every module's spend today and this month (cached). */
async function spentByModule(): Promise<Map<string, Spent>> {
  const day = utcDay();
  if (cached && cached.day === day && Date.now() - cached.at < CACHE_MS) return cached.byModule;
  const rows = await getStore().spend(`${day.slice(0, 7)}-01`, day);
  const byModule = new Map<string, Spent>();
  for (const { module, day: d, counts } of rows) {
    const s = byModule.get(module) ?? { day: 0, month: 0, calls: 0 };
    const usd = counts.cost_usd ?? 0;
    s.month += usd;
    if (d === day) (s.day += usd), (s.calls += counts.calls ?? 0);
    byModule.set(module, s);
  }
  cached = { at: Date.now(), day, byModule };
  return byModule;
}

/** The module's budget that's used up, if any (none set: no read at all). */
async function refusalOf(moduleId: string): Promise<BudgetRefusal | undefined> {
  const limits = budgetsOf(moduleId);
  if (limits.day === undefined && limits.month === undefined) return undefined;
  let spent: Spent;
  try {
    spent = (await spentByModule()).get(moduleId) ?? { day: 0, month: 0, calls: 0 };
  } catch (err) {
    // Not knowing what was spent doesn't stop the bot.
    warnOnce(err);
    return undefined;
  }
  if (limits.day !== undefined && spent.day >= limits.day) return { module: moduleId, period: "day", limit: limits.day, resetsAt: nextDayStart() };
  if (limits.month !== undefined && spent.month >= limits.month) return { module: moduleId, period: "month", limit: limits.month, resetsAt: nextMonthStart() };
  return undefined;
}

export function spendGate(moduleId: string): SpendGate {
  return {
    module: moduleId,
    async check() {
      const refusal = await refusalOf(moduleId);
      if (refusal) throw new BudgetUsedError(refusal);
    },
    async record(costUsd) {
      const cost = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0;
      try {
        await getStore().addSpend(moduleId, utcDay(), cost ? { calls: 1, cost_usd: cost } : { calls: 1 });
      } catch (err) {
        warnOnce(err);
        return;
      }
      if (cached?.day !== utcDay()) return;
      const s = cached.byModule.get(moduleId);
      if (s) (s.day += cost), (s.month += cost), (s.calls += 1);
      else cached.byModule.set(moduleId, { day: cost, month: cost, calls: 1 });
    },
  };
}

/** The module a capability serves: whose budget its calls spend. */
export const moduleOfCapability = (capabilityId: string): Module | undefined => modules().find((m) => m.capability?.id === capabilityId);

/** For the console: every metered module, with what it spent today and this month, and its budgets. */
export async function spendReport(): Promise<
  Array<{ module: string; label: string; calls: number; day: number; month: number; dailyBudget?: number; monthlyBudget?: number }>
> {
  let spent = new Map<string, Spent>();
  try {
    spent = await spentByModule();
  } catch (err) {
    warnOnce(err);
  }
  return modules()
    .filter((m) => m.capability?.meter)
    .map((m) => {
      const s = spent.get(m.id);
      const limits = budgetsOf(m.id);
      return {
        module: m.id,
        label: m.label,
        calls: s?.calls ?? 0,
        day: s?.day ?? 0,
        month: s?.month ?? 0,
        ...(limits.day !== undefined ? { dailyBudget: limits.day } : {}),
        ...(limits.month !== undefined ? { monthlyBudget: limits.month } : {}),
      };
    });
}

/** Forget the cached spend (tests). */
export function resetSpendCache(): void {
  cached = undefined;
  warned = false;
}
