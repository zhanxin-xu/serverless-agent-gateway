/**
 * The setup guide's checks and actions: what's configured, creating the
 * database, and testing each service with the settings in effect.
 */
import { channel, channels, database, guide, host, type DatabaseStatus } from "../../composition.js";
import { describeModules } from "../modules.js";
import { moduleById } from "../../modules/registry.js";
import { saveSettings } from "../../settings/service.js";
import { getStore, SCHEMA_VERSION } from "../../store/index.js";
import { HttpError, type Route } from "../http.js";

/** The deployment's database (src/composition.ts); without one, the store keeps everything in memory. */
async function databaseStatus(): Promise<DatabaseStatus> {
  const db = database();
  if (db) return db.status();
  return {
    label: "内存",
    connected: false,
    ready: true,
    version: SCHEMA_VERSION,
    expected: SCHEMA_VERSION,
    canApply: false,
    applyNote: "",
    manualNote: "",
  };
}

/** Run a check, timing it; a failure is a result to show, not an error. */
async function attempt(fn: () => Promise<string>): Promise<{ ok: boolean; message: string; ms: number }> {
  const started = Date.now();
  try {
    return { ok: true, message: await fn(), ms: Date.now() - started };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err), ms: Date.now() - started };
  }
}

function adapterFor(name: string) {
  const adapter = channel(name);
  if (!adapter) throw new HttpError(404, `没有 ${name} 渠道`);
  return adapter;
}

export const setupRoutes: Route[] = [
  {
    method: "GET",
    path: "status",
    async handler(req) {
      const database = await databaseStatus();
      return {
        origin: req.origin,
        host: { id: host().id, label: host().label },
        guide: guide(),
        database,
        channels: channels().map((c) => ({
          name: c.name,
          label: c.label,
          configured: c.isConfigured(),
          webhook: `${req.origin}/api/webhook/${c.name}`,
          canVerify: Boolean(c.verify),
          canConnect: Boolean(c.connect),
        })),
        modules: describeModules(),
        firstMessage: database.ready && (await getStore().hasChats()),
      };
    },
  },
  {
    method: "GET",
    path: "setup/schema",
    async handler() {
      const db = database();
      if (!db) throw new HttpError(404, "这个部署的存储不需要建表");
      return { sql: await db.schema() };
    },
  },
  {
    method: "POST",
    path: "setup/database",
    async handler() {
      const db = database();
      const status = await databaseStatus();
      if (!db || !status.connected) throw new HttpError(409, `还没有连接数据库：${guide().database.intro}`);
      if (!status.canApply) throw new HttpError(409, status.applyNote);
      try {
        await db.apply();
      } catch (err) {
        throw new HttpError(502, `建表失败：${err instanceof Error ? err.message : String(err)}`);
      }
      await getStore().log("schema", null, { version: SCHEMA_VERSION });
      return databaseStatus();
    },
  },
  {
    method: "POST",
    path: "checks/module/:id",
    handler: (_req, { id }) => {
      const module = moduleById(id!);
      if (!module?.check) throw new HttpError(404, `${id} 没有检查`);
      return attempt(() => module.check!());
    },
  },
  {
    method: "POST",
    path: "channels/:name/verify",
    handler: (_req, { name }) =>
      attempt(async () => {
        const adapter = adapterFor(name!);
        if (adapter.verify) return adapter.verify();
        if (!adapter.isConfigured()) throw new Error("还没填完凭据");
        return "已配置";
      }),
  },
  {
    method: "POST",
    path: "channels/:name/connect",
    async handler(req, { name }) {
      const adapter = adapterFor(name!);
      if (!adapter.connect) throw new HttpError(400, `${name} 不需要自动设置`);
      return attempt(async () => {
        const { message, settings } = await adapter.connect!(req.origin);
        if (settings) await saveSettings(settings, `connect-${name}`);
        return message;
      });
    },
  },
];
