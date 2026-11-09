// The image module's own settings; the self-reference defaults to the persona's picture.
import { persona } from "../../composition.js";
import type { ConfigDecl } from "../types.js";

export const imageSettings = (): ConfigDecl => ({
  group: { id: "image", label: "画图", help: "generate_image 工具：画图、修图、发自拍。需要沙盒。" },
  settings: [
    { key: "IMAGE_PROVIDER", group: "image", label: "画图服务", kind: "enum", capability: "image" },
    {
      key: "IMAGE_SELF_REFERENCE",
      group: "image",
      label: "形象参考图",
      kind: "text",
      default: persona().picture ?? "",
      help: "画她自己时一起发过去的参考图：部署里的文件或 https 链接；填 none 关闭。默认是人设自带的形象图。",
    },
  ],
});
