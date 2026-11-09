/**
 * Supabase's connection, from the environment only: the gateway needs it
 * before it can read any setting from the database. Vercel's Supabase
 * integration sets these.
 */
import { envValue } from "@gateway/core";

export const supabaseConfig = {
  get url() {
    return envValue("SUPABASE_URL").replace(/\/+$/, "");
  },
  get key() {
    return envValue("SUPABASE_SECRET_KEY");
  },
  get configured() {
    return Boolean(this.url && this.key);
  },
};
