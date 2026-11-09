// Settings of the Upstash Vector memory provider (pure data: src/settings/catalog.ts collects them).
import type { SettingDef, SettingGroup } from "../../../../settings/catalog.js";

export const GROUPS: SettingGroup[] = [
  {
    id: "memory.upstash-vector",
    label: "Upstash Vector",
    help: "Upstash Vector 索引（Dense，TEXT_EMBEDDING_3_SMALL，COSINE），由 Upstash 负责向量化，免费额度够用。",
    enabledBy: "UPSTASH_VECTOR_REST_TOKEN",
    module: "memory",
    provider: { capability: "vector-memory", id: "upstash-vector" },
  },
];

export const SETTINGS: SettingDef[] = [
  { key: "UPSTASH_VECTOR_REST_URL", group: "memory.upstash-vector", label: "REST URL", kind: "url" },
  { key: "UPSTASH_VECTOR_REST_TOKEN", group: "memory.upstash-vector", label: "REST Token", kind: "secret" },
];
