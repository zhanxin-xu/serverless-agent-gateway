/**
 * OpenAI's Image API: POST {base URL}/images/generations to draw, or
 * /images/edits with the references (https or data URLs, up to 16) to edit
 * or draw like them. The response reports tokens, not money, so a call's cost
 * is estimated from the instance's prices.
 */
import type { ImageBackend, ImageRequest } from "@gateway/core";
import type { ImagesConfig, ImagePrices } from "./config.js";

/** Lossless, so output_compression (JPEG / WebP only) doesn't apply; previews are made from it. */
const OUTPUT_FORMAT = "png";

/** About a megapixel, like the standard 1024x1024: an aspect ratio becomes the size closest to it with this area. */
const AREA = 1024 * 1024;

interface ImagesResponse {
  data?: Array<{ b64_json?: string }>;
  output_format?: string;
  usage?: {
    input_tokens?: number;
    input_tokens_details?: { text_tokens?: number; image_tokens?: number };
    output_tokens?: number;
  };
}

/**
 * The API's `size` for an aspect ratio ("16:9"): WIDTHxHEIGHT, both multiples
 * of 16, about AREA pixels. "auto" (or none) lets the model choose, which
 * follows the reference when there is one.
 */
export function sizeFor(aspectRatio: string | undefined): string {
  const m = aspectRatio?.match(/^(\d+):(\d+)$/);
  if (!m) return "auto";
  const ratio = Number(m[1]) / Number(m[2]);
  const round16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);
  const width = round16(Math.sqrt(AREA * ratio));
  return `${width}x${round16(width / ratio)}`;
}

/** USD for a call's tokens; undefined when the API didn't report them. */
export function costOf(usage: ImagesResponse["usage"], prices: ImagePrices): number | undefined {
  if (!usage) return undefined;
  const details = usage.input_tokens_details;
  // Without the split, every input token is priced as text (the cheaper rate).
  const text = details?.text_tokens ?? (details?.image_tokens === undefined ? (usage.input_tokens ?? 0) : 0);
  const image = details?.image_tokens ?? 0;
  return (text * prices.text_input + image * prices.image_input + (usage.output_tokens ?? 0) * prices.image_output) / 1_000_000;
}

export function openaiImagesClient(config: ImagesConfig): ImageBackend {
  return {
    async generate(request: ImageRequest) {
      const edit = request.references.length > 0;
      const body = {
        model: config.model,
        ...(config.quality ? { quality: config.quality } : {}),
        ...config.extraBody,
        output_format: OUTPUT_FORMAT,
        prompt: request.prompt,
        size: sizeFor(request.aspectRatio),
        ...(edit ? { images: request.references.map((url) => ({ image_url: url })) } : {}),
        ...(request.background !== undefined ? { background: request.background } : {}),
        ...(request.n !== undefined ? { n: request.n } : {}),
        // OpenAI's per-user abuse identity: a provider that flags misuse acts on this person, not the whole key.
        ...(request.endUser ? { safety_identifier: request.endUser } : {}),
      };
      const res = await fetch(`${config.baseUrl}/images/${edit ? "edits" : "generations"}`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.min(config.timeoutMs, request.timeoutMs)),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`image API HTTP ${res.status}: ${text.slice(0, 500)}`);
      const result = JSON.parse(text) as ImagesResponse;
      const images = (result.data ?? []).filter((d) => d.b64_json);
      if (!images.length) throw new Error(`the image API returned no image: ${text.slice(0, 300)}`);
      const cost = costOf(result.usage, config.prices);
      return {
        images: images.map((d) => ({ bytes: Buffer.from(d.b64_json!, "base64"), type: `image/${result.output_format ?? OUTPUT_FORMAT}` })),
        ...(cost !== undefined ? { cost } : {}),
      };
    },
  };
}
