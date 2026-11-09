/** Web search and reading pages. */
import type { PromptSectionContext } from "../../prompt/types.js";
import { use } from "../capability.js";
import type { Module } from "../types.js";
import { CONFIG } from "./settings.js";
import { searchCapability } from "./capability.js";
import { searchBalance, searchBalanceTool, webFetch, webSearch } from "./tools.js";

function guide(ctx: PromptSectionContext): string {
  return `# 查网

- 拿不准的时事、天气、新梗、事实先用 web_search 查，需要细看就 web_fetch，查不到就直说，别瞎编被人抓包嘲笑。${
    ctx.has(searchBalanceTool.name) ? "\n- 有人问搜索还剩多少钱，调 get_search_balance，查完照实报数。" : ""
  }`;
}

/** Called once by the loader (src/modules/index.ts), after every module file has loaded. */
export function searchModule(): Module {
  return {
    id: "search",
    label: "搜索",
    summary: "web_search 查网页、web_fetch 读网页全文。",
    capability: searchCapability,
    config: CONFIG,
    tools: [webSearch, webFetch, searchBalanceTool],
    section: { order: 5300, text: guide },
    meter: { key: "searches", label: "搜索（次）", tools: [webSearch.name, webFetch.name] },
    balance: searchBalance,
    async check() {
      const balance = searchBalance();
      if (balance) {
        const { tile } = await balance;
        return `余额 ${tile.value}${tile.detail ? `（${tile.detail}）` : ""}`;
      }
      const hits = await use(searchCapability).search("今天天气", 1, 30_000);
      return `搜索可用，返回 ${hits.length} 条结果`;
    },
  };
}
