import { settingValue } from "../../config.js";

export const deepseekConfig = {
  get apiKey() {
    return settingValue("DEEPSEEK_API_KEY");
  },
  get baseUrl() {
    return settingValue("DEEPSEEK_BASE_URL").replace(/\/+$/, "");
  },
};
