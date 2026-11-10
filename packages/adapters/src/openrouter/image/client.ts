/** OpenRouter's Image API: POST {base URL}/images; its key's limits from GET /key. */
import { overrideBody, type ImageBackend } from "@gateway/core";
import { keyBalance, keyReport } from "../key.js";
import { openrouterImagesConfig } from "./config.js";

/** Lossless, so output_compression (JPEG / WebP only) doesn't apply; previews are made from it. */
const OUTPUT_FORMAT = "png";

interface ImagesResponse {
  data?: Array<{ b64_json?: string; media_type?: string }>;
  usage?: { cost?: number };
}

export const openrouterImagesClient: ImageBackend = {
  async generate(request) {
    const { apiKey, baseUrl, model, quality, resolution, extraBody, timeoutMs } = openrouterImagesConfig;
    const body = overrideBody({
      model,
      quality,
      ...(resolution ? { resolution } : {}),
      output_format: OUTPUT_FORMAT,
      prompt: request.prompt,
      ...(request.references.length ? { input_references: request.references.map((url) => ({ type: "image_url", image_url: { url } })) } : {}),
      ...(request.aspectRatio !== undefined ? { aspect_ratio: request.aspectRatio } : {}),
      ...(request.background !== undefined ? { background: request.background } : {}),
      ...(request.n !== undefined ? { n: request.n } : {}),
      // OpenRouter's per-user identity, which it turns into the upstream one (OpenAI's safety_identifier).
      ...(request.endUser ? { user: request.endUser } : {}),
    }, extraBody);
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
  // The image key's limits (whether another module spends from the same key, the core tells).
  balance: async () => keyBalance("image_key", await keyReport(openrouterImagesConfig.baseUrl, openrouterImagesConfig.apiKey)),
};
