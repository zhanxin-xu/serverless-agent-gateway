/** The overview page: what's left on each module's service, today's usage, recent problems; and the admin log. */
import { channels } from "../../composition.js";
import { utcDay } from "../../chats/day.js";
import { getStore, type UsageCounts } from "../../store/index.js";
import { balanceGroups } from "../../modules/balance.js";
import type { Route } from "../http.js";

const DAY_MS = 86_400_000;

function sum(byChat: Record<string, UsageCounts>): UsageCounts {
  const total: UsageCounts = {};
  for (const counts of Object.values(byChat)) for (const [k, v] of Object.entries(counts)) total[k] = (total[k] ?? 0) + v;
  return total;
}

export const overviewRoutes: Route[] = [
  {
    method: "GET",
    path: "overview",
    async handler() {
      const store = getStore();
      // What's left on each key the modules that are on spend from: one tile per key, naming every module on it.
      const balances = await Promise.all(
        balanceGroups().flatMap((group) => {
          const [first] = group;
          const pending = first!.balance?.();
          if (!pending) return [];
          const ids = { module: first!.id, modules: group.map((m) => m.id), label: group.map((m) => m.label).join(" · ") };
          return [
            pending.then(
              (b) => ({ ...ids, ...b.tile, ...(group.length > 1 ? { detail: [b.tile.detail, "同一个 Key"].filter(Boolean).join(" · ") } : {}) }),
              (err: unknown) => ({ ...ids, error: err instanceof Error ? err.message : String(err) }),
            ),
          ];
        }),
      );
      const [today, problems] = await Promise.all([store.usageOfDay(utcDay()), store.problems(Date.now() - DAY_MS, 20)]);
      return {
        balances,
        today: { total: sum(today), chats: Object.keys(today).length },
        problems,
        channels: channels().map((c) => ({ name: c.name, configured: c.isConfigured() })),
      };
    },
  },
  { method: "GET", path: "admin-log", handler: () => getStore().adminLog(100) },
];
