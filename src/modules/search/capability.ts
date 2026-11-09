/** Web search: the interface every search provider implements, and the providers. */
import type { Balance, Capability } from "../types.js";
import { deepseekProvider } from "./providers/deepseek/index.js";

export interface SearchHit {
  title?: string;
  url?: string;
  site?: string;
  published?: string;
  summary: string;
  score?: number;
  authority?: number;
}

export interface SearchBackend {
  /** `timeoutMs`: the caller's time budget; a provider may stop sooner. */
  search(query: string, count: number, timeoutMs: number): Promise<SearchHit[]>;
  /** A page's main content, as Markdown. */
  fetch(url: string, timeoutMs: number): Promise<{ title: string; content: string }>;
  /** What's left on the account, when the service can tell. */
  balance?(): Promise<Balance>;
}

export const searchCapability: Capability<SearchBackend> = {
  id: "search",
  label: "搜索服务",
  selectionSetting: "SEARCH_PROVIDER",
  providers: [deepseekProvider],
};
