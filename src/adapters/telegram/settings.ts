// The Telegram channel's settings.
import type { ConfigDecl } from "../../modules/types.js";

export const CONFIG: ConfigDecl = {
  group: { id: "telegram", label: "Telegram", help: "@BotFather 给的 token。保存后点“设置 Webhook”。", enabledBy: "TELEGRAM_BOT_TOKEN" },
  settings: [
    { key: "TELEGRAM_BOT_TOKEN", group: "telegram", label: "Bot Token", kind: "secret" },
    { key: "TELEGRAM_WEBHOOK_SECRET", group: "telegram", label: "Webhook Secret", kind: "secret", help: "设置 Webhook 时自动生成。", setByConnect: true },
    {
      key: "TELEGRAM_BOT_USERNAME",
      group: "telegram",
      label: "机器人用户名",
      kind: "text",
      help: "不带 @。设置 Webhook 时自动填。填了以后群里只回 @ 它的消息。",
      setByConnect: true,
    },
  ],
};
