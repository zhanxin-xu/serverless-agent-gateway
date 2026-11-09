/** The overview page: what's left on each module's service, today's usage, recent problems; and the admin log. */
import { channels } from "../../channels/index.js";
import { utcDay } from "../../chats/day.js";
import { getStore, type UsageCounts } from "../../store/index.js";
import { activeModules } from "../../modules/registry.js";
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
      // Each module that's on and can tell what's left on its service (its own key, its own account).
      const balances = await Promise.all(
        activeModules().flatMap((m) => {
          const pending = m.balance?.();
          if (!pending) return [];
          return [
            pending.then(
              (b) => ({ module: m.id, label: m.label, ...b.tile }),
              (err: unknown) => ({ module: m.id, label: m.label, error: err instanceof Error ? err.message : String(err) }),
            ),
          ];
        }),
      );
      const [today, problems] = await Promise.all([store.usageOfDay(utcDay()), store.problems(Date.now() - DAY_MS, 20)]);
      return {
        balances,
        today: { total: sum(today), chats: Object.keys(today).length },
        problems,
        channels: [...channels.values()].map((c) => ({ name: c.name, configured: c.isConfigured() })),
      };
    },
  },
  { method: "GET", path: "admin-log", handler: () => getStore().adminLog(100) },
];
