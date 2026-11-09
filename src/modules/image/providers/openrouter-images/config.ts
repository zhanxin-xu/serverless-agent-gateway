import { settingInt, settingJson, settingValue } from "../../../../config.js";

/** OpenRouter's Image API. Names follow the API's fields. */
export const openrouterImagesConfig = {
  get apiKey() {
    return settingValue("IMAGE_API_KEY");
  },
  get baseUrl() {
    return settingValue("IMAGE_BASE_URL").replace(/\/+$/, "");
  },
  get model() {
    return settingValue("IMAGE_MODEL");
  },
  /** auto | low | medium | high | xhigh | max. Set here, not by the model: it drives the price. */
  get quality() {
    return settingValue("IMAGE_QUALITY");
  },
  /**
   * 512 | 768 | 1K | 1.5K | 2K | 4K, for models that take it (see supported_parameters in
   * GET /api/v1/images/models). Unset by default: the default gpt-image models don't, and
   * draw at about 1024px whatever is sent.
   */
  get resolution() {
    return settingValue("IMAGE_RESOLUTION");
  },
  /** Extra request body fields, e.g. {"provider":{"options":{"openai":{"moderation":"low"}}}}. */
  get extraBody() {
    return settingJson("IMAGE_EXTRA_BODY");
  },
  get timeoutMs() {
    return settingInt("IMAGE_TIMEOUT_MS");
  },
};
