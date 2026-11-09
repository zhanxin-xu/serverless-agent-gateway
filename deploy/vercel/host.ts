/**
 * Vercel Functions as the host: work after the response through waitUntil,
 * runs as long as the function may (maxDuration in vercel.json), and a run out
 * of time continuing in a fresh function: a POST to /api/worker (worker.ts),
 * which continues the unfinished turn from the log.
 *
 * No secret signs it: the request carries the run's lock owner id, and the
 * worker takes the lock over with it (takeOver in src/runtime/lock.ts), which
 * only works for the run that holds the lock, and only once.
 */
import { waitUntil } from "@vercel/functions";
import type { HandoffRequest, Host } from "../../src/composition.js";
import { envValue } from "../../src/config.js";

/** The function's time limit; keep in step with maxDuration in vercel.json (environment only). */
export const maxDurationMs = () => (Number.parseInt(envValue("AGENT_MAX_DURATION_SECONDS"), 10) || 300) * 1000;

/** Waits before each retry: a network error or a 5xx is worth one, a 4xx isn't. Exported for tests. */
export const workerRetry = { waitsMs: [1_000, 3_000] };

/** Ask /api/worker to run a chat. True once it accepted. */
export async function startWorker(origin: string, request: HandoffRequest): Promise<boolean> {
  const body = JSON.stringify(request);
  const { chatKey } = request;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${origin}/api/worker`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        console.log(`[handoff] ${chatKey}: started in the worker (HTTP ${res.status})`);
        return true;
      }
      if (res.status < 500) {
        console.error(`[handoff] ${chatKey}: the worker refused (HTTP ${res.status})`);
        return false;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      const wait = workerRetry.waitsMs[attempt - 1];
      const reason = err instanceof Error ? err.message : String(err);
      if (wait === undefined) {
        console.error(`[handoff] ${chatKey}: couldn't reach the worker after ${attempt} attempts (${reason})`);
        return false;
      }
      console.warn(`[handoff] ${chatKey}: attempt ${attempt} failed (${reason}), retrying`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

export const vercelHost: Host = {
  id: "vercel",
  label: "Vercel",
  background: (task) => waitUntil(task),
  runBudgetMs: maxDurationMs,
  handoff: startWorker,
  // Browsers revalidate every time; Vercel's CDN answers for them for a day.
  cdnCache: { "vercel-cdn-cache-control": "max-age=86400" },
};
