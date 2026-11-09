/** Image generation: the interface every image provider implements, and the providers. */
import { providersOf } from "../capability.js";
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
};
