import { instanceSettings } from "@gateway/core";

/** Its settings are IMAGE_OPENROUTER_… */
export const IMAGE_OPENROUTER = instanceSettings("image", "openrouter");

/** OpenRouter's Image API. Names follow the API's fields. */
export const openrouterImagesConfig = {
  get apiKey() {
    return IMAGE_OPENROUTER.value("api_key");
  },
  get baseUrl() {
    return IMAGE_OPENROUTER.value("base_url").replace(/\/+$/, "");
  },
  get model() {
    return IMAGE_OPENROUTER.value("model");
  },
  /** auto | low | medium | high | xhigh | max. Set here, not by the model: it drives the price. */
  get quality() {
    return IMAGE_OPENROUTER.value("quality");
  },
  /**
   * 512 | 768 | 1K | 1.5K | 2K | 4K, for models that take it (see supported_parameters in
   * GET /api/v1/images/models). Unset by default: the default gpt-image models don't, and
   * draw at about 1024px whatever is sent.
   */
  get resolution() {
    return IMAGE_OPENROUTER.value("resolution");
  },
  /** The body override, merged in last (overrideBody), e.g. {"provider":{"options":{"openai":{"moderation":"low"}}}}. */
  get extraBody() {
    return IMAGE_OPENROUTER.json("extra_body");
  },
  get timeoutMs() {
    return IMAGE_OPENROUTER.int("timeout_ms");
  },
};
