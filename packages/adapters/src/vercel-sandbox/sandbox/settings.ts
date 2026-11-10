// Settings of the Vercel Sandbox provider.
import type { ConfigDecl } from "@gateway/core";
import { SANDBOX_VERCEL } from "./config.js";

const key = SANDBOX_VERCEL.key;

const group = "sandbox.vercel";

export const CONFIG: ConfigDecl = {
  group: {
    id: group,
    label: "Vercel Sandbox",
    help: "每个聊天一个 Vercel Drive 挂在 /workspace。部署在 Vercel 上时自动认证；本地要 VERCEL_OIDC_TOKEN。",
    essentials: [key("enabled")],
  },
  settings: [
    {
      key: key("enabled"),
      group,
      label: "认证方式",
      kind: "enum",
      default: "",
      options: [
        { value: "", label: "自动（在 Vercel 上开启）" },
        { value: "1", label: "开（本地有 VERCEL_OIDC_TOKEN 时）" },
        { value: "0", label: "关" },
      ],
    },
    { key: key("region"), group, label: "区域", kind: "text", help: "默认 iad1。工作区盘建好以后不能改区域，要改请在第一次使用前改。" },
  ],
};
