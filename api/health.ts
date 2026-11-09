import { activeTools, MODULES, moduleStatus } from "../src/modules/registry.js";
import { channels } from "../src/channels/index.js";
import { config } from "../src/config.js";
import { refreshSettings } from "../src/settings/service.js";
import { storeBackend } from "../src/store/index.js";

function extraBodyStatus(): string {
  try {
    const keys = Object.keys(config.llm.extraBody);
    return keys.length ? `ok (${keys.join(", ")})` : "none";
  } catch (err) {
    return `error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// GET /api/health — what is configured (no secrets exposed).
export default {
  async fetch() {
    await refreshSettings();
    return Response.json({
      ok: true,
      model: config.llm.model,
      baseUrl: config.llm.baseUrl,
      apiKey: Boolean(config.llm.apiKey),
      extraBody: extraBodyStatus(),
      tools: activeTools().map((t) => t.name),
      store: storeBackend(),
      // Each module: on, or why not (src/modules).
      modules: Object.fromEntries(
        MODULES.map((m) => {
          const status = moduleStatus(m);
          return [m.id, status.ok ? true : status.reason];
        }),
      ),
      channels: Object.fromEntries([...channels.values()].map((c) => [c.name, c.isConfigured()])),
      admin: Boolean(config.admin.password),
    });
  },
};
