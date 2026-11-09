/**
 * Where chats live: sessions (one per chat), their append-only event logs,
 * reply state, images and webhook de-duplication. Modelled on dsh's session
 * log: a session row holding the log's header and the run state, and events
 * numbered by a contiguous per-chat `seq`.
 *
 * The admin console's tables (settings, chat profiles, usage, admin log) sit
 * beside them, each behind its own small interface (types.ts).
 *
 * The core defines the contract (types.ts) and one in-memory implementation
 * for local development and tests; the deployment's composition chooses the
 * store (src/composition.ts), e.g. Supabase (src/adapters/supabase).
 * scripts/storetest.ts runs the same cases against each.
 */
import { store } from "../composition.js";
import type { Store } from "./types.js";

export * from "./types.js";
export { MemoryStore } from "./memory.js";

let swapped: Store | undefined;

/**
 * The deployment's store, typed as everything it provides. Callers keep to
 * the narrow interface they need (ChatStore, SettingsStore, …) in their own signatures.
 */
export function getStore(): Store {
  return swapped ?? store();
}

/** Tests swap stores between cases; undefined goes back to the composed one. */
export function resetStore(next?: Store) {
  swapped = next;
}
