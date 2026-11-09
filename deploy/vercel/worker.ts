/**
 * Worker endpoint (`POST /api/worker`): a run that is out of time hands its
 * chat over to a fresh function here, which continues the unfinished turn.
 * The request is signed (host.ts).
 */
import crypto from "node:crypto";
import { channel, host } from "../../src/composition.js";
import { json } from "../../src/channels/types.js";
import { runChat, type ChatMeta } from "../../src/runtime/runner.js";
import { refreshSettings } from "../../src/settings/service.js";
import { getStore } from "../../src/store/index.js";
import { publicOrigin } from "../../src/webhook.js";
import { maxDurationMs, workerSignature, type WorkerRequest } from "./host.js";

export async function handleWorker(request: Request): Promise<Response> {
  // The function's clock started with this request.
  const deadline = Date.now() + maxDurationMs();
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  // The signature's key may come from the console's settings.
  await refreshSettings();
  const body = await request.text();
  const signature = Buffer.from(request.headers.get("x-worker-signature") ?? "");
  const expected = Buffer.from(workerSignature(body));
  if (!expected.length || signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) {
    return json({ error: "bad signature" }, 401);
  }

  const { chatKey, ambientClaimed } = JSON.parse(body) as Partial<WorkerRequest>;
  const { session } = chatKey ? await getStore().open(chatKey, Number.MAX_SAFE_INTEGER) : { session: null };
  if (!session) return json({ error: "unknown chat" }, 404);
  const meta: ChatMeta = {
    channel: session.channel,
    conversationId: session.conversationId,
    chatType: session.chatType,
    origin: publicOrigin(request),
  };
  const adapter = channel(meta.channel);
  if (!adapter?.send) return json({ error: `channel "${meta.channel}" can't run in the background` }, 400);

  console.log(`[worker] continuing ${chatKey}`);
  host().background(
    runChat(adapter, meta, { ambientClaimed: ambientClaimed === true, deadline }).catch((err) => console.error(`[worker] ${chatKey} failed`, err)),
  );
  return json({ ok: true }, 202);
}
