import { settingValue } from "@gateway/core";

export const telegramConfig = {
  get botToken() {
    return settingValue("TELEGRAM_BOT_TOKEN");
  },
  /** Must match the secret_token passed to setWebhook. */
  get webhookSecret() {
    return settingValue("TELEGRAM_WEBHOOK_SECRET");
  },
  /** Without @. When set, group messages are answered only if they mention the bot. */
  get botUsername() {
    return settingValue("TELEGRAM_BOT_USERNAME");
  },
};
