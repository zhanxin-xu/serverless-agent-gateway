/**
 * DeepSeek's tool APIs (https://api-docs.deepseek.com/zh-cn/guides/search):
 *   POST {DEEPSEEK_BASE_URL}/v1/tools/search  { query, count, ... } → { results: [...] }
 *   POST {DEEPSEEK_BASE_URL}/v1/tools/fetch   { url }               → { title, content }
 *   GET  {DEEPSEEK_BASE_URL}/user/balance                           → the account's balance
 * Plain HTTP APIs, so they work for whatever model the agent uses.
 */
import { getJson } from "../../../modules/shared/http.js";
import type { Balance } from "../../../modules/types.js";
import type { SearchBackend, SearchHit } from "../../../modules/search/capability.js";
import { deepseekConfig } from "./config.js";

/** A call gives up after this long, or sooner when the caller's budget is shorter. */
const TIMEOUT_MS = 30_000;
const MAX_RESULT_CHARS = 1_500;
/** DeepSeek tool API price: ¥5 per 1,000 successful search/fetch calls. */
const CNY_PER_SEARCH = 5 / 1000;

interface Result {
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  content?: string;
  site_name?: string;
  publish_time?: string;
  rerank_score?: number;
  authority?: number;
}

interface DeepSeekBalance {
  is_available: boolean;
  balance_infos?: Array<{ currency: string; total_balance: string; granted_balance: string; topped_up_balance: string }>;
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const { apiKey, baseUrl } = deepseekConfig;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, timeoutMs)),
  });
  const text = await res.text();
  if (!res.ok) {
    // OpenAI-style error body: { error: { message, type, code } }
    let message = text.slice(0, 300);
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
    } catch {}
    throw new Error(`DeepSeek ${path} HTTP ${res.status}: ${message}`);
  }
  return JSON.parse(text) as T;
}

/** The account's balance, as the model reads it. */
export async function deepseekBalanceReport() {
  const data = await getJson<DeepSeekBalance>(`${deepseekConfig.baseUrl}/user/balance`, deepseekConfig.apiKey);
  return {
    available: data.is_available,
    balances: (data.balance_infos ?? []).map((b) => ({
      currency: b.currency,
      total: b.total_balance,
      granted: b.granted_balance,
      topped_up: b.topped_up_balance,
      ...(b.currency === "CNY" ? { approx_search_calls_left: Math.floor(Number(b.total_balance) / CNY_PER_SEARCH) } : {}),
    })),
    pricing: "web_search / web_fetch: ¥5 per 1,000 successful calls (shared with any DeepSeek model usage)",
  };
}

async function balance(): Promise<Balance> {
  const report = await deepseekBalanceReport();
  const main = report.balances.find((b) => b.currency === "CNY") ?? report.balances[0];
  return {
    report,
    tile: {
      value: main ? `${main.currency === "CNY" ? "¥" : `${main.currency} `}${main.total}` : report.available ? "可用" : "不可用",
      ...(main?.approx_search_calls_left !== undefined ? { detail: `约 ${main.approx_search_calls_left} 次搜索` } : {}),
    },
  };
}

export const deepseekClient: SearchBackend = {
  async search(query, count, timeoutMs) {
    const data = await post<{ results?: Result[] }>("/v1/tools/search", { query, count }, timeoutMs);
    return (data.results ?? []).map(
      (r): SearchHit => ({
        title: r.title,
        url: r.url,
        site: r.site_name,
        published: r.publish_time,
        summary: (r.summary || r.snippet || "").slice(0, MAX_RESULT_CHARS),
        score: r.rerank_score,
        authority: r.authority,
      }),
    );
  },
  async fetch(url, timeoutMs) {
    const data = await post<{ title?: string; content?: string }>("/v1/tools/fetch", { url }, timeoutMs);
    return { title: data.title ?? "", content: data.content ?? "" };
  },
  balance,
};
