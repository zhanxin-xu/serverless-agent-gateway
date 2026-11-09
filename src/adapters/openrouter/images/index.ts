/** OpenRouter's Image API as the image provider. */
import type { Provider } from "../../../modules/types.js";
import { notReady, READY } from "../../../modules/types.js";
import { imageCapability, type ImageBackend } from "../../../modules/image/capability.js";
import { openrouterImagesClient } from "./client.js";
import { openrouterImagesConfig } from "./config.js";
import { CONFIG } from "./settings.js";

export const openrouterImagesProvider: Provider<ImageBackend> = {
  id: "openrouter-images",
  capability: imageCapability.id,
  config: CONFIG,
  available: () => (openrouterImagesConfig.apiKey ? READY : notReady("还没填画图的 API Key")),
  create: () => openrouterImagesClient,
};
