// Settings of the Vercel Sandbox provider (pure data: src/settings/catalog.ts collects them).
import type { SettingDef, SettingGroup } from "../../../../settings/catalog.js";

export const GROUPS: SettingGroup[] = [
  {
    id: "sandbox.vercel-sandbox",
    label: "Vercel Sandbox",
    help: "每个聊天一个 Vercel Drive 挂在 /workspace。部署在 Vercel 上时自动认证；本地要 VERCEL_OIDC_TOKEN。",
    module: "sandbox",
    provider: { capability: "sandbox", id: "vercel-sandbox" },
    essentials: ["SANDBOX_ENABLED"],
  },
];

export const SETTINGS: SettingDef[] = [
  {
    key: "SANDBOX_ENABLED",
    group: "sandbox.vercel-sandbox",
    label: "开关",
    kind: "enum",
    default: "",
    options: [
      { value: "", label: "自动（在 Vercel 上开启）" },
      { value: "1", label: "开" },
      { value: "0", label: "关" },
    ],
  },
  { key: "SANDBOX_REGION", group: "sandbox.vercel-sandbox", label: "区域", kind: "text", help: "默认 iad1。工作区盘建好以后不能改区域，要改请在第一次使用前改。" },
];
