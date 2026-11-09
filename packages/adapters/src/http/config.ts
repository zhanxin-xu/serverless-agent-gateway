import { settingValue } from "@gateway/core";

export const httpConfig = {
  /** Bearer token for the generic HTTP channel. Channel is disabled when empty. */
  get token() {
    return settingValue("HTTP_CHANNEL_TOKEN");
  },
};
