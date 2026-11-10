/** An OpenAI Image API endpoint as an image provider: one per composed instance, each with its own key and settings. */
import { imageCapability, notReady, READY, type ImageBackend, type Provider } from "@gateway/core";
import { openaiImagesClient } from "./client.js";
import { imagesConfig, type ImagesInstance } from "./config.js";
import { imagesSettings } from "./settings.js";

export type { ImagesInstance };

export function openaiImagesProvider(instance: ImagesInstance): Provider<ImageBackend> {
  const config = imagesConfig(instance);
  return {
    id: instance.id,
    capability: imageCapability.id,
    config: imagesSettings(instance),
    available: () => (config.apiKey ? READY : notReady(`还没填 ${instance.label} 画图的 API Key`)),
    create: () => openaiImagesClient(config),
    billedTo: () => config.apiKey || undefined,
  };
}
