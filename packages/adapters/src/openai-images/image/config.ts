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

/** USD per 1M tokens, by what the tokens are; the API reports tokens, not money. */
export interface ImagePrices {
  text_input: number;
  image_input: number;
  image_output: number;
}

/** gpt-image-2.6-sunburst's and -flare's list prices (developers.openai.com, November 2026). */
export const DEFAULT_PRICES: ImagePrices = { text_input: 5, image_input: 8, image_output: 30 };

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
    /** Merged into every request body, e.g. {"moderation":"low"}. */
    get extraBody() {
      return s.json("extra_body");
    },
    /** What the instance's tokens cost, to estimate a call's price; missing fields keep the defaults. */
    get prices(): ImagePrices {
      return { ...DEFAULT_PRICES, ...(s.json("prices") as Partial<ImagePrices>) };
    },
    get timeoutMs() {
      return s.int("timeout_ms");
    },
  };
}

export type ImagesConfig = ReturnType<typeof imagesConfig>;
