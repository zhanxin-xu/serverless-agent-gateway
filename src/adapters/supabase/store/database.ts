/**
 * Supabase's setup, for the console: its status, and creating or upgrading its
 * tables by running supabase/schema.sql (safe to run again) over a direct
 * Postgres connection. Without one the console shows the SQL to run by hand.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Database } from "../../../composition.js";
import { getStore, SCHEMA_VERSION } from "../../../store/index.js";
import { supabaseConfig } from "../config.js";

const URL_VARS = ["POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL"];
const SCHEMA_FILE = "supabase/schema.sql";

/** The name of the variable holding a direct connection string, if any. */
export function connectionVar(): string | undefined {
  return URL_VARS.find((name) => process.env[name]?.trim());
}

export function readSchema(): Promise<string> {
  return readFile(path.resolve(process.cwd(), SCHEMA_FILE), "utf8");
}

/** Run schema.sql. Throws with Postgres' message when it fails. */
export async function applySchema(): Promise<void> {
  const name = connectionVar();
  if (!name) throw new Error(`没有数据库直连地址（${URL_VARS.join(" / ")}）`);
  const url = new URL(process.env[name]!.trim());
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  // Supabase's certificate chain isn't in Node's store; encryption still applies.
  url.searchParams.delete("sslmode");
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url.toString(), ssl: local ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("set client_min_messages = warning");
    await client.query(await readSchema());
  } finally {
    await client.end();
  }
}

export const supabaseDatabase: Database = {
  async status() {
    const connected = supabaseConfig.configured;
    const version = connected ? await getStore().schemaVersion() : null;
    const via = connectionVar();
    return {
      label: "Supabase",
      connected,
      ready: version === SCHEMA_VERSION,
      version,
      expected: SCHEMA_VERSION,
      canApply: Boolean(connected && via),
      applyNote: via
        ? `会用 ${via} 直接执行 supabase/schema.sql，可以重复执行。`
        : `没有找到数据库直连地址（${URL_VARS.join(" / ")}），只能手动执行。`,
      manualNote: "打开 Supabase 控制台的 SQL Editor，粘贴下面的 SQL 执行，再回来点“检测”。",
    };
  },
  apply: applySchema,
  schema: readSchema,
};
