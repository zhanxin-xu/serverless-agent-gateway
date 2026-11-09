/** The run lock: one agent run per chat at a time, held on the session row. */
import crypto from "node:crypto";
import type { ChatStore } from "../store/index.js";

export const LOCK_TTL_MS = 60_000;
const LOCK_RENEW_MS = 20_000;

/** A chat's run lock: a lease that expires unless renewed, so a killed run can't hold it forever. */
export class RunLock {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private store: ChatStore,
    private chat: string,
    readonly owner: string = crypto.randomUUID(),
  ) {}

  async acquire(): Promise<boolean> {
    const ok = await this.store.lock(this.chat, this.owner, LOCK_TTL_MS, "acquire");
    if (ok) this.hold();
    return ok;
  }

  /** Start renewing a lock this owner already holds (the webhook took it during ingest). */
  hold() {
    clearInterval(this.timer);
    this.timer = setInterval(() => void this.renew(), LOCK_RENEW_MS);
    this.timer.unref?.();
  }

  private async renew() {
    try {
      if (!(await this.store.lock(this.chat, this.owner, LOCK_TTL_MS, "renew"))) console.warn(`[lock] lost ${this.chat}`);
    } catch (err) {
      console.warn(`[lock] renew failed for ${this.chat}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Stop renewing but keep the lease, renewed once more so whoever continues
   * has a whole lease to take it over in (takeOver). False when this run no
   * longer holds the lock: then there's nothing to hand over.
   */
  async handOver(): Promise<boolean> {
    this.stop();
    return this.store.lock(this.chat, this.owner, LOCK_TTL_MS, "renew");
  }

  private stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async release(): Promise<void> {
    this.stop();
    await this.store.lock(this.chat, this.owner, LOCK_TTL_MS, "release");
  }
}

/**
 * Continue a run handed over by the lock holder (Host.handoff): the holder
 * keeps its lock and passes on its owner id, which only it and the store know,
 * so presenting it proves the hand-over is genuine. Releasing by that owner
 * succeeds once (the ticket is used up), then the lock is taken under a new
 * owner. "invalid": not the holder (forged, used, or the lease went to another
 * run); "busy": someone took the chat in between, and carries on from the log.
 */
export async function takeOver(store: ChatStore, chat: string, owner: string): Promise<RunLock | "invalid" | "busy"> {
  if (!(await store.lock(chat, owner, LOCK_TTL_MS, "release"))) return "invalid";
  const lock = new RunLock(store, chat);
  return (await lock.acquire()) ? lock : "busy";
}
