/**
 * A long-running Node process as the host: background work just keeps
 * running after the response, and a run has no function to outlast, so it
 * never hands over; it gets a generous cap instead (AGENT_RUN_BUDGET_SECONDS).
 */
import type { Host } from "../../src/composition.js";
import { envValue } from "../../src/config.js";

export const nodeHost: Host = {
  id: "node",
  label: "Node 服务",
  background(task) {
    task.catch((err) => console.error("[background]", err));
  },
  runBudgetMs: () => (Number.parseInt(envValue("AGENT_RUN_BUDGET_SECONDS"), 10) || 1800) * 1000,
};
