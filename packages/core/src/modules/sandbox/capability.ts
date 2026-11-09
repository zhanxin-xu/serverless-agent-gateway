/** The workspace: a Linux box per chat with a folder that persists between runs. */
import { providersOf } from "../capability.js";
import type { Capability } from "../types.js";
import type { Workspace } from "./workspace.js";

export interface SandboxBackend {
  /** Start a workspace for this chat, its persistent folder mounted at WORKDIR. */
  open(chatKey: string): Promise<Workspace>;
}

export const sandboxCapability: Capability<SandboxBackend> = {
  id: "sandbox",
  label: "沙盒服务",
  selectionSetting: "SANDBOX_PROVIDER",
  // Whatever the deployment composed for it (src/composition.ts).
  get providers() {
    return providersOf<SandboxBackend>(this.id);
  },
  stateful: true,
};
