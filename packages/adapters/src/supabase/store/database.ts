/**
 * Supabase's setup, for the console: its status, and creating or upgrading its
 * tables by running schema.sql (../schema.sql, safe to run again) over a direct
 * Postgres connection. Without one the console shows the SQL to run by hand.
 *
 * Some upgrades move data too:
 *   - renamed settings still set under an old name in the environment are
 *     moved into the console's settings (schema.sql renames the console's own);
 *   - version 6 rewrites the events written before it (gateway.migrate_events_v6),
 *     which needs the chat model's identity as it is now: read after the
 *     settings are renamed, so it's a step of its own (apply() runs both; by
 *     hand, schema() gives one, then the other).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { currentModelIdentity, refreshSettings, SCHEMA_VERSION, type Database, type ModelIdentity } from "@gateway/core";
import { supabaseConfig } from "../config.js";
import { PostgresStore, type GatewayInfo } from "./store.js";

const URL_VARS = ["POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL"];
/** Next to this package's Supabase code (copied into dist/ by the build). */
const SCHEMA_FILE = fileURLToPath(new URL("../schema.sql", import.meta.url));

/** The name of the variable holding a direct connection string, if any. */
export function connectionVar(): string | undefined {
  return URL_VARS.find((name) => process.env[name]?.trim());
}

export function readSchema(): Promise<string> {
  return readFile(SCHEMA_FILE, "utf8");
}

/**
 * Settings renamed by an upgrade that the deployment still sets under an old
 * name in its environment: stored in the console's settings under the new
 * name, unless that name is set already (in the environment or the console).
 * schema.sql renamed the console's own; this is the environment's half. By
 * hand (SQL only), the environment variables are renamed by hand.
 */
async function moveRenamedEnvironment(client: { query<R extends object>(sql: string, values?: unknown[]): Promise<{ rows: R[] }> }) {
  const { rows } = await client.query<{ old_key: string; new_key: string }>("select old_key, new_key from gateway.renamed_settings() order by rank");
  for (const { old_key: from, new_key: to } of rows) {
    const value = process.env[from]?.trim();
    if (!value || process.env[to]?.trim()) continue;
    await client.query("insert into gateway.settings (key, value) values ($1, $2) on conflict (key) do nothing", [to, value]);
  }
}

/** The chat model's identity now, for migrating the events written before version 6. */
async function modelIdentity(): Promise<ModelIdentity> {
  // schema.sql renamed the model's settings: read them again.
  await refreshSettings({ force: true });
  const identity = currentModelIdentity();
  if (!identity) throw new Error("旧的聊天记录要按现在用的模型转换格式：先在“模型”一步填好模型，再回来升级");
  return identity;
}

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** The data step of version 6, as SQL to run by hand. */
async function migrationSql(): Promise<string> {
  const { api, provider, model } = await modelIdentity();
  return `select gateway.migrate_events_v6(${literal(api)}, ${literal(provider)}, ${literal(model)});\n`;
}

/** Run schema.sql, then whatever data it leaves to migrate. Throws with Postgres' message when it fails. */
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
    await moveRenamedEnvironment(client);
    const { rows } = await client.query<{ legacy: boolean }>("select gateway.has_legacy_events() as legacy");
    if (rows[0]?.legacy) {
      const { api, provider, model } = await modelIdentity();
      await client.query("select gateway.migrate_events_v6($1, $2, $3)", [api, provider, model]);
    }
  } finally {
    await client.end();
  }
}

async function info(): Promise<GatewayInfo> {
  return supabaseConfig.configured ? new PostgresStore(supabaseConfig.url, supabaseConfig.key).info() : { schemaVersion: null };
}

export const supabaseDatabase: Database = {
  async status() {
    const connected = supabaseConfig.configured;
    const { schemaVersion: version, legacyEvents } = await info();
    const via = connectionVar();
    return {
      label: "Supabase",
      connected,
      ready: version === SCHEMA_VERSION,
      version,
      expected: SCHEMA_VERSION,
      canApply: Boolean(connected && via),
      applyNote: via
        ? `会用 ${via} 直接执行建表 SQL（schema.sql），可以重复执行。`
        : `没有找到数据库直连地址（${URL_VARS.join(" / ")}），只能手动执行。`,
      manualNote: legacyEvents
        ? "表已经是新版，还差把旧的聊天记录转成新格式：在 Supabase 控制台的 SQL Editor 执行下面这一句，再回来点“检测”。"
        : "打开 Supabase 控制台的 SQL Editor，粘贴下面的 SQL 执行，再回来点“检测”。手动升级不会处理环境变量：改过名的配置（见部署文档）要在环境变量里自己改名。",
    };
  },
  apply: applySchema,
  async schema() {
    return (await info()).legacyEvents ? migrationSql() : readSchema();
  },
};
