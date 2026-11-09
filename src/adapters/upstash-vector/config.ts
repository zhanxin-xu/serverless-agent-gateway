import { settingValue } from "../../config.js";

export const upstashConfig = {
  get url() {
    return settingValue("UPSTASH_VECTOR_REST_URL").replace(/\/+$/, "");
  },
  get token() {
    return settingValue("UPSTASH_VECTOR_REST_TOKEN");
  },
};
