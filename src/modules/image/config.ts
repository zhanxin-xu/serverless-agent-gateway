/** The image module's own settings (its provider has its own: providers/<id>/config.ts). */
import { settingValue } from "../../config.js";

export const imageConfig = {
  /**
   * A picture of the persona (a file in the deployment, or an https URL),
   * sent as a reference whenever generate_image draws her (include_self), so
   * she looks the same every time. "none" turns it off.
   */
  get selfImage() {
    const value = settingValue("IMAGE_SELF_REFERENCE");
    return value.toLowerCase() === "none" ? "" : value;
  },
};
