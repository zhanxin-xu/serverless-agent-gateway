/**
 * A failed pi-ai call as the core's errors. pi-ai reports a failure as a
 * message (stopReason "error" with errorMessage), not an HTTP status, so it is
 * classified by its text, after DeepSeek Harness's pi-ai adapter
 * (classifyPiAiError). The order matters: an out-of-credit error may come as a
 * 429 or a 403, and is not worth retrying.
 */
import { ModelCallError, OutOfCreditError } from "@gateway/core";

const OUT_OF_CREDIT = /\b402\b|insufficient[ _](?:credits?|balance|funds|quota)|exceeded your current quota|key limit exceeded|spending limit|out of credits?/i;

const TRANSIENT = [
  /\b429\b|rate.?limit|overloaded/i,
  /\b5\d\d\b/,
  /\btime(?:d)?\s*out\b|timeout/i,
  // The stream ended without the provider's terminal event: the connection dropped mid-response.
  /stream ended (?:before|without)\b/i,
  /\b(?:network|connection|socket|fetch failed)\b|\bECONN[A-Z]+\b|\bterminated\b|premature close|other side closed/i,
];

/** When the limit resets, if the message says ("…; resets 2026-11-06T00:00:00.000Z.", possibly inside the error's JSON). */
function resetsAt(message: string): number | undefined {
  const at = Date.parse(/resets (\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))/.exec(message)?.[1] ?? "");
  return Number.isNaN(at) ? undefined : at;
}

export function callError(message: string): ModelCallError {
  if (OUT_OF_CREDIT.test(message)) return new OutOfCreditError(`model: ${message}`, resetsAt(message));
  return new ModelCallError(`model: ${message}`, TRANSIENT.some((pattern) => pattern.test(message)));
}
