/**
 * Vercel Functions as the host: work after the response through waitUntil,
 * runs as long as the function may (maxDuration in vercel.json), and a run out
 * of time continuing in a fresh function: a signed POST to /api/worker
 * (worker.ts), which continues the unfinished turn from the log.
 *
 * The caller releases the chat's lock first and the worker takes it again. If
 * a webhook grabs it in between, that run carries on instead: either way one
 * run continues from the log, and the other finds the chat busy.
 */
import crypto from "node:crypto";
import { waitUntil } from "@vercel/functions";
import type { Host } from "../../src/composition.js";
import { config, envValue, settingValue } from "../../src/config.js";

export interface WorkerRequest {
  chatKey: string;
  /** The sampler window was already claimed for this run (an ambient message woke it). */
  ambientClaimed?: boolean;
}

/** The function's time limit; keep in step with maxDuration in vercel.json (environment only). */
export const maxDurationMs = () => (Number.parseInt(envValue("AGENT_MAX_DURATION_SECONDS"), 10) || 300) * 1000;

/** The key worker requests are signed with: WORKER_SECRET, else derived from secrets only this deployment has. */
function workerSecret(): string {
  const set = settingValue("WORKER_SECRET");
  if (set) return set;
  const seed = envValue("ADMIN_PASSWORD") + config.llm.apiKey;
  return seed ? crypto.createHash("sha256").update(`worker:${seed}`).digest("hex") : "";
}

/** Signature of a worker request body; empty when there's nothing to sign with (then no worker request is valid). */
export function workerSignature(body: string): string {
  const secret = workerSecret();
  return secret ? crypto.createHmac("sha256", secret).update(body).digest("hex") : "";
}

/** Waits before each retry: a network error or a 5xx is worth one, a 4xx isn't. Exported for tests. */
export const workerRetry = { waitsMs: [1_000, 3_000] };

/** Ask /api/worker to run a chat. True once it accepted. */
export async function startWorker(origin: string, request: WorkerRequest): Promise<boolean> {
  const body = JSON.stringify(request);
  const { chatKey } = request;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${origin}/api/worker`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-worker-signature": workerSignature(body) },
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
  config: {
    group: { id: "vercel", label: "Vercel", help: "部署在 Vercel 上才有的设置。" },
    settings: [
      {
        key: "WORKER_SECRET",
        group: "vercel",
        label: "Worker 签名密钥",
        kind: "secret",
        help: "一轮在一个函数里跑不完、交给新函数接着跑时用来签名。留空时由管理密码和模型密钥算出来。",
        generate: true,
      },
    ],
  },
  // Browsers revalidate every time; Vercel's CDN answers for them for a day.
  cdnCache: { "vercel-cdn-cache-control": "max-age=86400" },
};
