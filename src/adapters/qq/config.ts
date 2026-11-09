import { settingValue } from "../../config.js";

export const qqConfig = {
  get appId() {
    return settingValue("QQ_APP_ID");
  },
  get appSecret() {
    return settingValue("QQ_APP_SECRET");
  },
};
