/**
 * generate_image, over whichever image provider is selected (capability.ts).
 * Results are saved to the workspace (so send_file can deliver them) and shown
 * to the model. Reference images are workspace paths, turned into data URLs here.
 *
 * `include_self` puts the persona's own picture (IMAGE_SELF_REFERENCE) first
 * among the references, so every selfie shows the same character instead of
 * one the model reinvents from words each time.
 *
 * get_image_key_limit: what's left on the image service's account.
 */
import path from "node:path";
import sharp from "sharp";
import { bundledDataUrl } from "../../media/assets.js";
import { persona } from "../../composition.js";
import { balanceReport, canReportBalance, capabilityBalance } from "../balance.js";
import { use } from "../capability.js";
import { WORKDIR, saveAttachment, sendFile, workspaceFor } from "../sandbox/index.js";
import type { Tool, ToolContext } from "../tool.js";
import { imageCapability } from "./capability.js";
import { imageConfig } from "./config.js";

/** Where generated images go. */
const OUTDIR = `${WORKDIR}/images`;
/** Results larger than 1080p (either orientation) are scaled down to fit. */
const MAX_LONG = 1920;
const MAX_SHORT = 1080;
/** What the model is shown of a result (it is saved at full size). */
const PREVIEW_SIDE = 1024;

const ASPECT_RATIOS = ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"];
const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const EXTENSIONS: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
const MAX_REFERENCES = 16;
/** Tells the image model who the first reference is (it reads prompts best in English). */
const selfNote = () =>
  `The first reference image is the character herself: draw the same girl, keeping ${persona().appearanceForImages}, whatever the pose, scene or outfit asked for.`;

/** The persona's picture as a reference: an https URL as-is, or a bundled file as a data URL. */
async function selfReference(): Promise<string> {
  const image = imageConfig.selfImage;
  if (/^https?:\/\//i.test(image)) return image;
  try {
    return await bundledDataUrl(image);
  } catch (err) {
    throw new Error(`can't read IMAGE_SELF_REFERENCE ${image}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** A reference image: an http(s) URL as-is, or a workspace file as a data URL. */
async function reference(ctx: ToolContext, ref: string): Promise<string> {
  if (/^https?:\/\//i.test(ref)) return ref;
  const file = path.posix.resolve(WORKDIR, ref);
  const bytes = await (await workspaceFor(ctx)).read(file);
  if (!bytes) throw new Error(`reference ${file} not found`);
  let type = MEDIA_TYPES[path.posix.extname(file).toLowerCase()];
  if (!type) {
    const format = (await sharp(bytes).metadata().catch(() => undefined))?.format;
    if (!format) throw new Error(`reference ${file} isn't an image`);
    type = `image/${format}`;
  }
  return `data:${type};base64,${bytes.toString("base64")}`;
}

/** Scale down to fit 1080p when larger; returns the bytes to save and the final size. */
async function capTo1080p(bytes: Buffer): Promise<{ bytes: Buffer; width?: number; height?: number }> {
  const { width, height } = await sharp(bytes).metadata();
  if (!width || !height) return { bytes };
  const landscape = width >= height;
  const scale = Math.min(1, MAX_LONG / (landscape ? width : height), MAX_SHORT / (landscape ? height : width));
  if (scale >= 1) return { bytes, width, height };
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return { bytes: await sharp(bytes).resize(w, h).toBuffer(), width: w, height: h };
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

export const generateImage: Tool = {
  name: "generate_image",
  get description() {
    return (
      "Generate or edit images with an image model. With input_references (images in your workspace, e.g. a photo saved with " +
      `${saveAttachment.name}) it edits / restyles them; without, it draws from the prompt alone. Results are saved under ` +
      `${OUTDIR}/ and shown to you; check them, then send with ${sendFile.name}. Each call costs money: make one good prompt ` +
      "(describe subject, style, lighting, composition; say what to keep when editing) rather than many tries." +
      (imageConfig.selfImage
        ? " Whenever you are in the picture (a selfie, you doing something, you with someone), set include_self: your own " +
          "picture goes along as the first reference, so you look like yourself every time. Describe the scene, pose, " +
          "expression and outfit, not your face or hair: those come from the picture."
        : "")
    );
  },
  get parameters() {
    return {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What to draw, or how to change the reference images." },
        input_references: {
          type: "array",
          items: { type: "string" },
          maxItems: MAX_REFERENCES,
          description: `Reference images: workspace paths (relative paths are under ${WORKDIR}, e.g. "inbox/632-photo.jpg") or https URLs.`,
        },
        ...(imageConfig.selfImage
          ? { include_self: { type: "boolean", description: `You (${persona().name}) are in the picture: add your own picture as the first reference.` } }
          : {}),
        aspect_ratio: { type: "string", enum: ASPECT_RATIOS, description: "Default: auto (follows the reference, or square)." },
        background: { type: "string", enum: ["auto", "transparent", "opaque"] },
        n: { type: "integer", minimum: 1, maximum: 10, description: "How many images. Default 1." },
      },
      required: ["prompt"],
    };
  },
  async run(args, ctx) {
    const prompt = String(args.prompt ?? "").trim();
    if (!prompt) throw new Error("prompt is empty");
    const refs = Array.isArray(args.input_references) ? args.input_references.map(String) : [];
    const self = args.include_self === true && Boolean(imageConfig.selfImage);
    if (refs.length + (self ? 1 : 0) > MAX_REFERENCES) {
      throw new Error(`at most ${MAX_REFERENCES} reference images${self ? ", your own picture included" : ""}`);
    }
    const n = args.n === undefined || args.n === null ? undefined : Number(args.n);
    if (n !== undefined && !(Number.isInteger(n) && n >= 1 && n <= 10)) throw new Error("n is 1 to 10");
    if (args.aspect_ratio !== undefined && !ASPECT_RATIOS.includes(String(args.aspect_ratio))) {
      throw new Error(`aspect_ratio is one of ${ASPECT_RATIOS.join(", ")}`);
    }

    const left = ctx.callBudgetMs();
    if (left < 20_000) throw new Error("not enough time left in this function to generate an image; the turn continues in a fresh function, try again there");

    const references = [...(self ? [await selfReference()] : []), ...(await Promise.all(refs.map((r) => reference(ctx, r))))];
    const result = await use(imageCapability).generate({
      prompt: self ? `${prompt}\n\n${selfNote()}` : prompt,
      references,
      ...(args.aspect_ratio !== undefined ? { aspectRatio: String(args.aspect_ratio) } : {}),
      ...(args.background !== undefined ? { background: String(args.background) } : {}),
      ...(n !== undefined ? { n } : {}),
      timeoutMs: left,
    });

    const ws = await workspaceFor(ctx);
    const base = stamp();
    const lines: string[] = [];
    for (const [i, image] of result.images.entries()) {
      const { bytes, width, height } = await capTo1080p(image.bytes);
      const file = `${OUTDIR}/${base}-${i + 1}${EXTENSIONS[image.type] ?? ".png"}`;
      await ws.write(file, bytes);
      const preview = await sharp(bytes).resize(PREVIEW_SIDE, PREVIEW_SIDE, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      ctx.images.push({ type: "image", data: preview.toString("base64"), mimeType: "image/jpeg" });
      lines.push(`${file} (${width && height ? `${width}x${height}, ` : ""}${bytes.byteLength} bytes)`);
    }
    const cost = result.cost !== undefined ? `, cost $${result.cost}` : "";
    return (
      `generated ${result.images.length} image(s)${cost}; saved and shown to you right after this:\n${lines.join("\n")}\n` +
      `If one looks right, send it with ${sendFile.name}.`
    );
  },
};

/** The image service's balance, when the provider in use can tell. */
export const imageBalance = () => capabilityBalance(imageCapability);

export const imageKeyLimit: Tool = {
  name: "get_image_key_limit",
  description:
    "Check the spending limit, remaining credit and usage (today / this week / this month / all time, USD) of image_key, " +
    "the API key that pays for generate_image. If another of your tools spends from the same key, it says so.",
  parameters: { type: "object", properties: {} },
  // Only when the image provider in use can tell.
  enabled: () => canReportBalance(imageCapability),
  run: () => balanceReport("image"),
};
