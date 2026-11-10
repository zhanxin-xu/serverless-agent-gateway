import { instanceSettings } from "@gateway/core";

/** One OpenAI Image API endpoint the deployment composes (openaiImagesProvider). */
export interface ImagesInstance {
  /** Unique among the image module's providers; its settings are IMAGE_{ID}_… */
  id: string;
  /** Its name in the console. */
  label: string;
  /** A line about it in the console. */
  help: string;
  /** Its base URL by default. */
  baseUrl: string;
  /** Its image model by default. */
  model: string;
}

/** An instance's settings. Names follow the API's fields. */
export function imagesConfig(instance: ImagesInstance) {
  const s = instanceSettings("image", instance.id);
  return {
    key: s.key,
    get apiKey() {
      return s.value("api_key");
    },
    get baseUrl() {
      return s.value("base_url", instance.baseUrl).replace(/\/+$/, "");
    },
    get model() {
      return s.value("model", instance.model);
    },
    /** low | medium | high | xhigh | max | auto. Set here, not by the model: it drives the price. */
    get quality() {
      return s.value("quality");
    },
    /** The body override, merged in last (overrideBody), e.g. {"moderation":"low"}. */
    get extraBody() {
      return s.json("extra_body");
    },
    get timeoutMs() {
      return s.int("timeout_ms");
    },
  };
}

export type ImagesConfig = ReturnType<typeof imagesConfig>;
