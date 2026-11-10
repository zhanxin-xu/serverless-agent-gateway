import { settingJson, settingValue } from "@gateway/core";

/** The body override is the gateway's own setting, so it's named like any instance's: MEMORY_UPSTASH_EXTRA_BODY. */
export const BODY_OVERRIDE = "MEMORY_UPSTASH_EXTRA_BODY";

export const upstashConfig = {
  get url() {
    return settingValue("UPSTASH_VECTOR_REST_URL").replace(/\/+$/, "");
  },
  get token() {
    return settingValue("UPSTASH_VECTOR_REST_TOKEN");
  },
  /** Merged into every request's body last (overrideBody). */
  get extraBody() {
    return settingJson(BODY_OVERRIDE);
  },
};
