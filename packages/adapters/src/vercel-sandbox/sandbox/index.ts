/**
 * Vercel Sandbox as the workspace: each chat has its own Vercel Drive mounted
 * at WORKDIR in a sandbox that lives for one agent run. On Vercel the SDK
 * authenticates with the project's OIDC token; locally it needs
 * VERCEL_OIDC_TOKEN (`vercel env pull`).
 */
import { notReady, READY, sandboxCapability, type Provider, type SandboxBackend } from "@gateway/core";
import { vercelSandboxConfig } from "./config.js";
import { CONFIG } from "./settings.js";

export const vercelSandboxProvider: Provider<SandboxBackend> = {
  id: "vercel-sandbox",
  capability: sandboxCapability.id,
  config: CONFIG,
  available: () =>
    vercelSandboxConfig.enabled ? READY : notReady("只在 Vercel 上自动开启；本地要设 VERCEL_OIDC_TOKEN，或在配置里关掉了"),
  // The SDK is loaded on first use, so runs that never touch the workspace don't pay for it.
  create: () => ({ open: async (chatKey) => (await import("./client.js")).openVercelWorkspace(chatKey) }),
};
