/**
 * A per-chat workspace: the interface the sandbox tools use, and its
 * lifetime (one per agent run). Which service provides it is the sandbox
 * capability's choice (capability.ts); Vercel Sandbox is the first provider.
 *
 * A workspace lives for one agent run: opened on the first workspace tool
 * call, closed when the run ends. Files under WORKDIR survive between runs
 * (each chat has its own persistent storage there); everything else is gone
 * next time. `pip install` and `npm install -g` install under WORKDIR, so each
 * chat keeps its own packages.
 */
import { use } from "../capability.js";
import type { ToolContext } from "../tool.js";
import { sandboxCapability } from "./capability.js";

export const WORKDIR = "/workspace";

export interface Workspace {
  /** Run a bash command in WORKDIR; output is stdout and stderr combined. */
  run(command: string, timeoutSeconds: number): Promise<{ exitCode: number | null; output: string }>;
  /** Create or overwrite a file (parent folders are created). */
  write(file: string, content: string | Uint8Array): Promise<void>;
  /** null when the file doesn't exist. */
  read(file: string): Promise<Buffer | null>;
  close(): Promise<void>;
}

export type WorkspaceFactory = (chatKey: string) => Promise<Workspace>;

let factory: WorkspaceFactory | undefined;

/** Tests swap in a fake workspace. */
export function setWorkspaceFactory(f: WorkspaceFactory) {
  factory = f;
}

const open = new WeakMap<ToolContext, Promise<Workspace>>();

export function workspaceFor(ctx: ToolContext): Promise<Workspace> {
  let ws = open.get(ctx);
  if (!ws) {
    ws = factory ? factory(ctx.chat.key) : use(sandboxCapability).open(ctx.chat.key);
    open.set(ctx, ws);
    ws.catch(() => open.delete(ctx)); // let a later call try again
    ctx.onRunEnd(() => closeWorkspace(ctx));
  }
  return ws;
}

/** Stop the run's sandbox, if one was started (registered with ctx.onRunEnd when it starts). */
export async function closeWorkspace(ctx: ToolContext): Promise<void> {
  const ws = open.get(ctx);
  if (!ws) return;
  open.delete(ctx);
  try {
    await (await ws).close();
  } catch (err) {
    console.warn(`[sandbox] close failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
