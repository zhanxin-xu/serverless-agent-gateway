/**
 * Worker endpoint (`POST /api/worker`): a run that is out of time hands its
 * chat over to a fresh function here, which continues the unfinished turn.
 * The request carries the run's lock owner id; taking the lock over with it
 * is what proves the request genuine (host.ts).
 */
import { channel, getStore, host, json, publicOrigin, refreshSettings, runChat, takeOver, type ChatMeta, type HandoffRequest } from "@gateway/core";
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
  // The lock first: until the caller proves it holds it, nothing about the chat is read or said
  // (an unknown chat and a wrong owner look the same).
  const lock = await takeOver(store, chatKey, lockOwner);
  // Not the lock holder: forged, already taken over, or the lease went to another run.
  if (lock === "invalid") return json({ error: "not the lock holder" }, 401);
  // A message's run took the chat in between: it carries on from the log.
  if (lock === "busy") return json({ ok: true, busy: true }, 202);
  const { session } = await store.open(chatKey, Number.MAX_SAFE_INTEGER);
  const adapter = session ? channel(session.channel) : undefined;
  if (!session || !adapter?.send) {
    await lock.release();
    return json({ error: "this chat can't run in the background" }, 400);
  }

  const meta: ChatMeta = { channel: session.channel, conversationId: session.conversationId, chatType: session.chatType, origin: publicOrigin(request) };
  console.log(`[worker] continuing ${chatKey}`);
  host().background(
    runChat(adapter, meta, { ambientClaimed: ambientClaimed === true, deadline, lock }).catch((err) => console.error(`[worker] ${chatKey} failed`, err)),
  );
  return json({ ok: true }, 202);
}
