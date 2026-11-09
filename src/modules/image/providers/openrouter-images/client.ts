/** OpenRouter's Image API: POST {IMAGE_BASE_URL}/images; its key's limits from GET /key. */
import { config } from "../../../../config.js";
import { keyBalance, keyReport, KEY_NOTE } from "../../../shared/openrouter-key.js";
import type { Balance } from "../../../types.js";
import type { ImageBackend } from "../../capability.js";
import { openrouterImagesConfig } from "./config.js";

/** Lossless, so output_compression (JPEG / WebP only) doesn't apply; previews are made from it. */
const OUTPUT_FORMAT = "png";

interface ImagesResponse {
  data?: Array<{ b64_json?: string; media_type?: string }>;
  usage?: { cost?: number };
}

/** The image key's limits; when it's the model's key too, saying so instead of counting it twice. */
async function balance(): Promise<Balance> {
  const { apiKey, baseUrl } = openrouterImagesConfig;
  if (apiKey === config.llm.apiKey) {
    return {
      report: { currency: "USD", image_key: "same key as model_key (get_llm_key_limit): one limit and one usage for both", note: KEY_NOTE },
      tile: { value: "与模型共用", detail: "额度见模型那一格" },
    };
  }
  return keyBalance("image_key", await keyReport(baseUrl, apiKey));
}

export const openrouterImagesClient: ImageBackend = {
  async generate(request) {
    const { apiKey, baseUrl, model, quality, resolution, extraBody, timeoutMs } = openrouterImagesConfig;
    const body = {
      model,
      quality,
      ...(resolution ? { resolution } : {}),
      ...extraBody,
      output_format: OUTPUT_FORMAT,
      prompt: request.prompt,
      ...(request.references.length ? { input_references: request.references.map((url) => ({ type: "image_url", image_url: { url } })) } : {}),
      ...(request.aspectRatio !== undefined ? { aspect_ratio: request.aspectRatio } : {}),
      ...(request.background !== undefined ? { background: request.background } : {}),
      ...(request.n !== undefined ? { n: request.n } : {}),
    };
    const res = await fetch(`${baseUrl}/images`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(timeoutMs, request.timeoutMs)),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`image API HTTP ${res.status}: ${text.slice(0, 500)}`);
    const result = JSON.parse(text) as ImagesResponse;
    const images = (result.data ?? []).filter((d) => d.b64_json);
    if (!images.length) throw new Error(`the image API returned no image: ${text.slice(0, 300)}`);
    return {
      images: images.map((d) => ({ bytes: Buffer.from(d.b64_json!, "base64"), type: d.media_type ?? "image/png" })),
      ...(typeof result.usage?.cost === "number" ? { cost: result.usage.cost } : {}),
    };
  },
  balance,
};
