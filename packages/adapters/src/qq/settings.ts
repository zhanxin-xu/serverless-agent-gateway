// The QQ channel's settings.
import type { ConfigDecl } from "@gateway/core";

export const CONFIG: ConfigDecl = {
  group: {
    id: "qq",
    label: "QQ",
    help: "QQ 开放平台的机器人。把下面的回调地址填进 QQ 开放平台；大陆的 QQ 服务器访问不了一些海外域名（比如 *.vercel.app），必须先绑定自定义域名。",
    enabledBy: "QQ_APP_SECRET",
  },
  settings: [
    { key: "QQ_APP_ID", group: "qq", label: "AppID", kind: "text" },
    { key: "QQ_APP_SECRET", group: "qq", label: "AppSecret", kind: "secret" },
  ],
};
