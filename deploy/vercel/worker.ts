/**
 * Worker endpoint (`POST /api/worker`): a run that is out of time hands its
 * chat over to a fresh function here, which continues the unfinished turn.
 * The request carries the run's lock owner id; taking the lock over with it
 * is what proves the request genuine (host.ts).
 */
import { channel, host, type HandoffRequest } from "../../src/composition.js";
import { json } from "../../src/channels/types.js";
import { takeOver } from "../../src/runtime/lock.js";
import { runChat, type ChatMeta } from "../../src/runtime/runner.js";
import { refreshSettings } from "../../src/settings/service.js";
import { getStore } from "../../src/store/index.js";
import { publicOrigin } from "../../src/webhook.js";
import { maxDurationMs } from "./host.js";

export async function handleWorker(request: Request): Promise<Response> {
  // The function's clock started with this request.
  const deadline = Date.now() + maxDurationMs();
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: Partial<HandoffRequest>;
  try {
    body = JSON.parse(await request.text()) as Partial<HandoffRequest>;
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const { chatKey, lockOwner, ambientClaimed } = body;
  if (typeof chatKey !== "string" || typeof lockOwner !== "string" || !lockOwner) return json({ error: "bad request" }, 400);

  await refreshSettings();
  const store = getStore();
  const { session } = await store.open(chatKey, Number.MAX_SAFE_INTEGER);
  if (!session) return json({ error: "unknown chat" }, 404);
  const adapter = channel(session.channel);
  if (!adapter?.send) return json({ error: `channel "${session.channel}" can't run in the background` }, 400);

  const lock = await takeOver(store, chatKey, lockOwner);
  // Not the lock holder: forged, already taken over, or the lease went to another run.
  if (lock === "invalid") return json({ error: "not the lock holder" }, 401);
  // A message's run took the chat in between: it carries on from the log.
  if (lock === "busy") return json({ ok: true, busy: true }, 202);

  const meta: ChatMeta = { channel: session.channel, conversationId: session.conversationId, chatType: session.chatType, origin: publicOrigin(request) };
  console.log(`[worker] continuing ${chatKey}`);
  host().background(
    runChat(adapter, meta, { ambientClaimed: ambientClaimed === true, deadline, lock }).catch((err) => console.error(`[worker] ${chatKey} failed`, err)),
  );
  return json({ ok: true }, 202);
}
