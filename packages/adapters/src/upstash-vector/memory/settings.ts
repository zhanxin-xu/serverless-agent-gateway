// Settings of the Upstash Vector memory provider.
import type { ConfigDecl } from "@gateway/core";

export const CONFIG: ConfigDecl = {
  group: {
    id: "memory.upstash-vector",
    label: "Upstash Vector",
    help: "Upstash Vector 索引（Dense，TEXT_EMBEDDING_3_SMALL，COSINE），由 Upstash 负责向量化，免费额度够用。",
    enabledBy: "UPSTASH_VECTOR_REST_TOKEN",
    essentials: ["UPSTASH_VECTOR_REST_URL", "UPSTASH_VECTOR_REST_TOKEN"],
  },
  settings: [
    { key: "UPSTASH_VECTOR_REST_URL", group: "memory.upstash-vector", label: "REST URL", kind: "url" },
    { key: "UPSTASH_VECTOR_REST_TOKEN", group: "memory.upstash-vector", label: "REST Token", kind: "secret" },
  ],
};
