/**
 * Upstash Vector (REST API). The index is created with a built-in embedding
 * model, so raw text goes in (`/upsert-data`, `/query-data`) and no embedding
 * API of our own is needed.
 */
import type { MemoryHit, MemoryMetadata, VectorMemory } from "../../capability.js";
import { upstashConfig } from "./config.js";

const TIMEOUT_MS = 15_000;

async function vectorApi<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const { url, token } = upstashConfig;
  const res = await fetch(`${url}/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok || data.error) throw new Error(`Upstash Vector ${path}: ${data.error ?? `HTTP ${res.status}`}`);
  return data.result as T;
}

export const upstashVectorClient: VectorMemory = {
  async upsert(id, text, metadata) {
    await vectorApi("upsert-data", { id, data: text, metadata });
  },
  async query(text, topK) {
    const hits = await vectorApi<Array<{ id: string; score: number; data?: string; metadata?: MemoryMetadata }>>("query-data", {
      data: text,
      topK,
      includeMetadata: true,
      includeData: true,
    });
    return hits.map((h): MemoryHit => ({ id: h.id, score: h.score, text: h.data, metadata: h.metadata }));
  },
  async delete(ids) {
    return (await vectorApi<{ deleted: number }>("delete", { ids }, "DELETE")).deleted;
  },
};
