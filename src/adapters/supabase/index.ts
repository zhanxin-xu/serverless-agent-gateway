/**
 * Supabase (Postgres) as the store: each operation is one call to a function
 * from supabase/schema.sql over the Data API (POST /rest/v1/rpc/<name>), so the
 * multi-step ones (ingest, append) are single transactions.
 */
export { supabaseConfig } from "./config.js";
export { supabaseDatabase } from "./database.js";
export { PostgresStore } from "./store.js";
