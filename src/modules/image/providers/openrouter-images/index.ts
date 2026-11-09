/** OpenRouter's Image API as the image provider. */
import type { Provider } from "../../../types.js";
import { notReady, READY } from "../../../types.js";
import type { ImageBackend } from "../../capability.js";
import { openrouterImagesClient } from "./client.js";
import { openrouterImagesConfig } from "./config.js";
import { GROUPS } from "./settings.js";

export const openrouterImagesProvider: Provider<ImageBackend> = {
  id: "openrouter-images",
  label: GROUPS[0]!.label,
  description: GROUPS[0]!.help,
  settings: GROUPS[0]!.id,
  available: () => (openrouterImagesConfig.apiKey ? READY : notReady("还没填画图的 API Key")),
  create: () => openrouterImagesClient,
};
