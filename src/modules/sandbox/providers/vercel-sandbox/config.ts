import { envValue, settingValue } from "../../../../config.js";

export const vercelSandboxConfig = {
  /** On by default where credentials exist (on Vercel, or with VERCEL_OIDC_TOKEN); SANDBOX_ENABLED=0 turns it off. */
  get enabled() {
    const setting = settingValue("SANDBOX_ENABLED");
    if (/^(0|false|off)$/i.test(setting)) return false;
    return Boolean(envValue("VERCEL") || envValue("VERCEL_OIDC_TOKEN") || /^(1|true|on)$/i.test(setting));
  },
  /** Region for sandboxes and their drives (they must match). Default: Vercel's default, iad1. */
  get region() {
    return settingValue("SANDBOX_REGION");
  },
};
