/**
 * Files that ship with the deployment (its assets/, e.g. the persona's voice
 * clip and picture). Settings name them relative to the deployment's own
 * directory (Composition.baseDir), never the process's working directory,
 * which depends on how the host runs it. Model APIs take them as data URLs;
 * each file is read once per instance.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { baseDir } from "../composition.js";

const MEDIA_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const cache = new Map<string, Promise<string>>();

/** Where a file of the deployment is on disk: `file` is relative to its directory (or absolute). */
export const deploymentFile = (file: string): string => path.resolve(baseDir(), file);

/** A file of the deployment as a data URL. Rejects when it can't be read. */
export function bundledDataUrl(file: string): Promise<string> {
  let hit = cache.get(file);
  if (!hit) {
    const type = MEDIA_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    hit = readFile(deploymentFile(file)).then((bytes) => `data:${type};base64,${bytes.toString("base64")}`);
    // A failed read isn't cached: the file may appear (or the error may pass) on the next call.
    hit.catch(() => cache.delete(file));
    cache.set(file, hit);
  }
  return hit;
}
