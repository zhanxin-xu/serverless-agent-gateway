/** GET /api/health: what is configured, for a quick look (no secrets exposed). */
import { channels, database, host } from "./composition.js";
import { config } from "./config.js";
import { activeTools, allModules, moduleStatus } from "./modules/registry.js";
import { refreshSettings } from "./settings/service.js";

function extraBodyStatus(): string {
  try {
    const keys = Object.keys(config.llm.extraBody);
    return keys.length ? `ok (${keys.join(", ")})` : "none";
  } catch (err) {
    return `error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function healthReport(): Promise<Response> {
  await refreshSettings();
  const db = database();
  return Response.json({
    ok: true,
    host: host().id,
    model: config.llm.model,
    baseUrl: config.llm.baseUrl,
    apiKey: Boolean(config.llm.apiKey),
    extraBody: extraBodyStatus(),
    tools: activeTools().map((t) => t.name),
    store: db ? (await db.status()).label : "memory",
    // Each module: on, or why not (src/modules).
    modules: Object.fromEntries(
      allModules().map((m) => {
        const status = moduleStatus(m);
        return [m.id, status.ok ? true : status.reason];
      }),
    ),
    channels: Object.fromEntries(channels().map((c) => [c.name, c.isConfigured()])),
    admin: Boolean(config.admin.password),
  });
}
