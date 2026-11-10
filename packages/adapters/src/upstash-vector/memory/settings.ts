// Settings of the Upstash Vector memory provider. Named as Vercel's Upstash integration injects them
// (UPSTASH_VECTOR_REST_*), not MEMORY_UPSTASH_…: connecting the integration fills them in.
import { bodyOverrideSetting, type ConfigDecl } from "@gateway/core";
import { BODY_OVERRIDE } from "./config.js";

export const CONFIG: ConfigDecl = {
  group: {
    id: "memory.upstash",
    label: "Upstash Vector",
    help: "Upstash Vector 索引（Dense，TEXT_EMBEDDING_3_SMALL，COSINE），由 Upstash 负责向量化，免费额度够用。",
    enabledBy: "UPSTASH_VECTOR_REST_TOKEN",
    essentials: ["UPSTASH_VECTOR_REST_URL", "UPSTASH_VECTOR_REST_TOKEN"],
  },
  settings: [
    { key: "UPSTASH_VECTOR_REST_URL", group: "memory.upstash", label: "REST URL", kind: "url" },
    { key: "UPSTASH_VECTOR_REST_TOKEN", group: "memory.upstash", label: "REST Token", kind: "secret" },
    bodyOverrideSetting(BODY_OVERRIDE, "memory.upstash", '{"includeVectors":false}', "写入、查询、删除都会合并。"),
  ],
};
