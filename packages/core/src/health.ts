/** GET /api/health: what is configured, for a quick look (no secrets exposed). */
import { channels, database, host } from "./composition.js";
import { config } from "./config.js";
import { select } from "./modules/capability.js";
import { chatModelCapability } from "./modules/model/capability.js";
import { activeTools, allModules, moduleStatus } from "./modules/registry.js";
import { refreshSettings } from "./settings/service.js";

/** The chat model in use (protocol, endpoint, model), or why there is none. */
function modelStatus(): { provider: string; api: string; endpoint: string; model: string } | string {
  try {
    const selection = select(chatModelCapability);
    if (!selection.ok) return selection.reason;
    const { api, provider, model } = selection.provider.create().identity();
    return { provider: selection.provider.id, api, endpoint: provider, model };
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
    model: modelStatus(),
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
