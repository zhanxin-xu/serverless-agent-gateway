// The image module's own settings (pure data: src/settings/catalog.ts collects them).
import type { SettingDef, SettingGroup } from "../../settings/catalog.js";

export const DEFAULT_SELF_IMAGE = "assets/persona/dafeiyu.webp";

export const GROUPS: SettingGroup[] = [{ id: "image", label: "画图", help: "generate_image 工具：画图、修图、发自拍。需要沙盒。", module: "image" }];

export const SETTINGS: SettingDef[] = [
  {
    key: "MODULE_IMAGE",
    group: "image",
    label: "开关",
    kind: "enum",
    default: "on",
    options: [
      { value: "on", label: "开" },
      { value: "off", label: "关" },
    ],
    help: "关掉后所有聊天都不提供这个模块；依赖它的模块也会跟着关。",
  },
  { key: "IMAGE_PROVIDER", group: "image", label: "画图服务", kind: "enum", capability: "image" },
  {
    key: "IMAGE_SELF_REFERENCE",
    group: "image",
    label: "形象参考图",
    kind: "text",
    default: DEFAULT_SELF_IMAGE,
    help: "画她自己时一起发过去的参考图：部署里的文件或 https 链接；填 none 关闭。",
  },
];
