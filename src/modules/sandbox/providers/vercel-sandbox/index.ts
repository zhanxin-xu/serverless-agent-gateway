/**
 * Vercel Sandbox as the workspace: each chat has its own Vercel Drive mounted
 * at WORKDIR in a sandbox that lives for one agent run. On Vercel the SDK
 * authenticates with the project's OIDC token; locally it needs
 * VERCEL_OIDC_TOKEN (`vercel env pull`).
 */
import type { Provider } from "../../../types.js";
import { notReady, READY } from "../../../types.js";
import type { SandboxBackend } from "../../capability.js";
import { vercelSandboxConfig } from "./config.js";
import { GROUPS } from "./settings.js";

export const vercelSandboxProvider: Provider<SandboxBackend> = {
  id: "vercel-sandbox",
  label: GROUPS[0]!.label,
  description: GROUPS[0]!.help,
  settings: GROUPS[0]!.id,
  available: () =>
    vercelSandboxConfig.enabled ? READY : notReady("只在 Vercel 上自动开启；本地要设 VERCEL_OIDC_TOKEN，或在配置里关掉了"),
  // The SDK is loaded on first use, so runs that never touch the workspace don't pay for it.
  create: () => ({ open: async (chatKey) => (await import("./client.js")).openVercelWorkspace(chatKey) }),
};
