/**
 * Supabase (Postgres):
 *   store/       the store (PostgresStore) and its setup for the console (supabaseDatabase).
 *                Each operation is one call to a function from supabase/schema.sql over the
 *                Data API (POST /rest/v1/rpc/<name>), so the multi-step ones are single transactions.
 *   config.ts    the connection, from the environment
 */
export { supabaseConfig } from "./config.js";
export { supabaseDatabase } from "./store/database.js";
export { PostgresStore } from "./store/store.js";
