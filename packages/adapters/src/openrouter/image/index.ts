/** OpenRouter's Image API as the image provider. */
import { imageCapability, notReady, READY, type ImageBackend, type Provider } from "@gateway/core";
import { openrouterImagesClient } from "./client.js";
import { openrouterImagesConfig } from "./config.js";
import { CONFIG } from "./settings.js";

/** `modelKey`: the chat model's key, when it may be the same OpenRouter key (its balance is then shown once). */
export function openrouterImagesProvider(options: { modelKey?: () => string } = {}): Provider<ImageBackend> {
  const client = openrouterImagesClient(options.modelKey);
  return {
    id: "openrouter-images",
    capability: imageCapability.id,
    config: CONFIG,
    available: () => (openrouterImagesConfig.apiKey ? READY : notReady("还没填画图的 API Key")),
    create: () => client,
  };
}
