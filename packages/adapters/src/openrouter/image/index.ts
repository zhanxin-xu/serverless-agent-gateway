/** OpenRouter's Image API as the image provider. */
import { imageCapability, notReady, READY, type ImageBackend, type Provider } from "@gateway/core";
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
