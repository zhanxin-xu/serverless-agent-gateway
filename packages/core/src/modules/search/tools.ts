/**
 * web_search / web_fetch / get_search_balance, over whichever search provider
 * is selected (capability.ts). Their names and parameters don't change with
 * the provider.
 */
import { select, use } from "../capability.js";
import type { Tool } from "../tool.js";
import { searchCapability } from "./capability.js";

const MAX_FETCH_CHARS = 12_000;

export const webSearch: Tool = {
  name: "web_search",
  description:
    "Search the web for up-to-date information. Returns titles, URLs, summaries and publish times. " +
    'Supports operators: site:example.com, -site:, "exact phrase", -keyword, lang:zh,en, after:2025, before:2026-01-01. ' +
    "Use web_fetch to read a result in full.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query, 1-128 characters." },
      count: { type: "integer", description: "Number of results, 1-20. Default 5.", minimum: 1, maximum: 20 },
    },
    required: ["query"],
  },
  async run(args, ctx) {
    const query = String(args.query ?? "").slice(0, 128);
    const count = Math.min(Math.max(Number(args.count) || 5, 1), 20);
    const results = await use(searchCapability).search(query, count, ctx.callBudgetMs());
    return JSON.stringify({ query, results });
  },
};

export const webFetch: Tool = {
  name: "web_fetch",
  description: "Fetch a web page and return its main content as Markdown.",
  parameters: {
    type: "object",
    properties: { url: { type: "string", description: "Absolute http(s) URL." } },
    required: ["url"],
  },
  async run(args, ctx) {
    const url = String(args.url ?? "");
    if (!/^https?:\/\//i.test(url)) throw new Error("url must start with http:// or https://");
    const page = await use(searchCapability).fetch(url, ctx.callBudgetMs());
    return JSON.stringify({
      url,
      title: page.title,
      content: page.content.length > MAX_FETCH_CHARS ? `${page.content.slice(0, MAX_FETCH_CHARS)}\n…(truncated)` : page.content,
    });
  },
};

/** The search account's balance, when the provider in use can tell. */
export function searchBalance() {
  const selection = select(searchCapability);
  const backend = selection.ok ? selection.provider.create() : undefined;
  return backend?.balance?.();
}

export const searchBalanceTool: Tool = {
  name: "get_search_balance",
  description: "Check the remaining balance of the account that pays for web_search / web_fetch, and roughly how many more calls it covers.",
  parameters: { type: "object", properties: {} },
  // Only when the search provider in use can tell.
  enabled: () => {
    const selection = select(searchCapability);
    return selection.ok && Boolean(selection.provider.create().balance);
  },
  async run() {
    const balance = searchBalance();
    if (!balance) throw new Error("the search service in use can't report its balance");
    return JSON.stringify((await balance).report);
  },
};
