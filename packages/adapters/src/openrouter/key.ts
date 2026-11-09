/**
 * OpenRouter's GET {base}/key: a key's limits and spend. The model and image
 * modules each report their own key with it (get_llm_key_limit,
 * get_image_key_limit, and the console's overview).
 */
import { getJson, type Balance } from "@gateway/core";

interface Budget {
  scope: string;
  limit_usd: number;
  spend_usd: number;
  remaining_usd: number;
  reset_interval: string | null;
  resets_at: string | null;
  include_byok?: boolean;
}

/** OpenRouter's GET /key. `usage*` is spend on OpenRouter credits; `byok_usage*` is spend billed to your own provider keys. */
interface KeyInfo {
  data: {
    label?: string;
    limit: number | null;
    limit_remaining: number | null;
    limit_reset: string | null;
    include_byok_in_limit?: boolean;
    usage: number;
    usage_daily: number;
    usage_weekly: number;
    usage_monthly: number;
    byok_usage?: number;
    byok_usage_daily?: number;
    byok_usage_weekly?: number;
    byok_usage_monthly?: number;
    is_free_tier?: boolean;
    expires_at?: string | null;
    effective_budget?: Budget | null;
  };
}

/** One key's limit and usage from OpenRouter's GET /key; an error is reported in place. */
export async function keyReport(baseUrl: string, apiKey: string, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  let data: KeyInfo["data"];
  try {
    ({ data } = await getJson<KeyInfo>(`${baseUrl}/key`, apiKey, headers));
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  // Not OpenRouter: something answered /key, but not with a key report.
  if (!data || typeof data !== "object") return { error: "this service has no key-limit endpoint (GET /key)" };
  const budget = data.effective_budget;
  const hasByok = [data.byok_usage, data.byok_usage_daily, data.byok_usage_weekly, data.byok_usage_monthly].some((n) => typeof n === "number");
  return {
    label: data.label,
    limit: data.limit ?? "unlimited",
    limit_remaining: data.limit_remaining ?? "unlimited",
    limit_reset: data.limit_reset ?? "never",
    ...(data.include_byok_in_limit === undefined ? {} : { limit_counts_byok: data.include_byok_in_limit }),
    // Spend on OpenRouter credits only.
    usage: { today: data.usage_daily, this_week: data.usage_weekly, this_month: data.usage_monthly, all_time: data.usage },
    // Spend billed to your own provider keys (BYOK); not in `usage`.
    ...(hasByok
      ? { byok_usage: { today: data.byok_usage_daily ?? 0, this_week: data.byok_usage_weekly ?? 0, this_month: data.byok_usage_monthly ?? 0, all_time: data.byok_usage ?? 0 } }
      : {}),
    // The budget that blocks requests first (guardrail / workspace / key limit).
    effective_budget: budget
      ? {
          scope: budget.scope,
          limit: budget.limit_usd,
          spent: budget.spend_usd,
          remaining: budget.remaining_usd,
          reset_interval: budget.reset_interval,
          resets_at: budget.resets_at,
          ...(budget.include_byok === undefined ? {} : { counts_byok: budget.include_byok }),
        }
      : null,
    is_free_tier: data.is_free_tier,
    expires_at: data.expires_at ?? null,
  };
}

/** What every key report says about how to read it. */
export const KEY_NOTE =
  "usage = spend on OpenRouter credits; byok_usage = spend on your own provider keys. A budget or limit that counts BYOK " +
  "includes both, so it can show spend while usage is 0. Daily / weekly / monthly windows reset at 00:00 UTC (08:00 Beijing), weeks run Monday–Sunday.";

const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

/** A key report as a balance: the model gets the report, the console a tile with today's spend against the limit. */
export function keyBalance(name: string, report: Record<string, unknown>): Balance {
  if (typeof report.error === "string") throw new Error(report.error);
  const usage = report.usage as { today?: number } | undefined;
  const byok = report.byok_usage as { today?: number } | undefined;
  const today = (Number(usage?.today) || 0) + (Number(byok?.today) || 0);
  const budget = report.effective_budget as { limit?: number; spent?: number; reset_interval?: string | null } | null;
  const limit = budget?.limit ?? (typeof report.limit === "number" ? report.limit : undefined);
  const spent = budget?.spent ?? today;
  return {
    report: { currency: "USD", [name]: report, note: KEY_NOTE },
    tile: {
      value: `今日 ${usd(today)}`,
      detail: limit ? `限额 ${usd(limit)}${budget?.reset_interval ? `（${budget.reset_interval}）` : ""} · 已用 ${usd(spent)}` : "不限额",
      ...(limit ? { used: Math.min(1, spent / limit) } : {}),
    },
  };
}
