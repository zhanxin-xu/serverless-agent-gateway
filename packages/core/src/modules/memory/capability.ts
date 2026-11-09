/** Long-term memory: a store of short texts searched by meaning, shared by every chat. */
import { providersOf } from "../capability.js";
import type { Capability } from "../types.js";

/** Where a memory came from. */
export interface MemoryMetadata {
  /** ISO time it was saved. */
  at: string;
  chat: string;
  /** 群聊 / 私聊 */
  scene: string;
  by: string;
}

export interface MemoryHit {
  id: string;
  /** 0–1, higher is closer. */
  score: number;
  text?: string;
  metadata?: MemoryMetadata;
}

export interface VectorMemory {
  /** Save (or replace) one memory; the store turns the text into a vector itself. */
  upsert(id: string, text: string, metadata: MemoryMetadata): Promise<void>;
  query(text: string, topK: number): Promise<MemoryHit[]>;
  /** How many were deleted. */
  delete(ids: string[]): Promise<number>;
}

export const memoryCapability: Capability<VectorMemory> = {
  id: "vector-memory",
  label: "记忆存储",
  selectionSetting: "MEMORY_PROVIDER",
  // Whatever the deployment composed for it (src/composition.ts).
  get providers() {
    return providersOf<VectorMemory>(this.id);
  },
  stateful: true,
};
