/** Image generation: the interface every image provider implements, and the providers. */
import { providersOf } from "../capability.js";
import { BudgetUsedError } from "../spend.js";
import type { Balance, Capability } from "../types.js";

export interface ImageRequest {
  prompt: string;
  /** Reference images, as https URLs or data URLs: the images to edit, or to draw like. */
  references: string[];
  aspectRatio?: string;
  background?: string;
  n?: number;
  /** The caller's time budget. */
  timeoutMs: number;
  /** The person it's drawn for, opaque and stable (llm/end-user.ts): the provider's per-user abuse identity. */
  endUser?: string;
}

export interface ImageResult {
  /** Full-size images, lossless. */
  images: Array<{ bytes: Buffer; type: string }>;
  /** USD, when the service reports it. */
  cost?: number;
}

export interface ImageBackend {
  generate(request: ImageRequest): Promise<ImageResult>;
  /** What's left on the account, when the service can tell. */
  balance?(): Promise<Balance>;
}

export const imageCapability: Capability<ImageBackend> = {
  id: "image",
  label: "画图服务",
  selectionSetting: "IMAGE_PROVIDER",
  // Whatever the deployment composed for it (src/composition.ts).
  get providers() {
    return providersOf<ImageBackend>(this.id);
  },
  // What a call cost, where the service reports it; otherwise it counts 0.
  meter: (backend, gate) => ({
    ...(backend.balance ? { balance: () => backend.balance!() } : {}),
    async generate(request) {
      try {
        await gate.check();
      } catch (err) {
        // The tool fails with this; the model tells them.
        if (err instanceof BudgetUsedError) throw new Error(`${err.message}. Tell them in your own words, don't retry.`);
        throw err;
      }
      const result = await backend.generate(request);
      await gate.record(result.cost ?? 0);
      return result;
    },
  }),
};
