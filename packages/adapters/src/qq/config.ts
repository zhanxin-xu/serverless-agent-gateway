import { settingValue } from "@gateway/core";

export const qqConfig = {
  get appId() {
    return settingValue("QQ_APP_ID");
  },
  get appSecret() {
    return settingValue("QQ_APP_SECRET");
  },
};
