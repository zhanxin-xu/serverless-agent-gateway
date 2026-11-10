/** Drawing, editing pictures, selfies. Needs the workspace: references come from it and results go to it. */
import type { PromptSectionContext } from "../../prompt/types.js";
import type { Module } from "../types.js";
import { INBOX, saveAttachment, sendFile } from "../sandbox/index.js";
import { imageSettings } from "./settings.js";
import { imageCapability } from "./capability.js";
import { imageConfig } from "./config.js";
import { generateImage, imageBalance, imageKeyLimit } from "./tools.js";

function guide(ctx: PromptSectionContext): string {
  const lines = [
    imageConfig.selfImage
      ? "- **发自拍 / 画你自己（或你和别人同框）**：必须设置 `include_self=true`！你的标准照片会作为第一张参考图一起发过去，每次画出来都是同一个你。prompt 里只写动作、表情、场景和穿搭，别自己凭空描述五官发色，不然每次都长得不一样。"
      : "",
    "- **图里有认得出的真人**：只有照片里的人本人要求才改、才拿来当参考图；别人要改，一律拒绝（见红线）。",
    `- **修图 / 改群友发的图**：先用 ${saveAttachment.name} 把对方消息（或对方引用的旧消息）里的原图存进 \`${INBOX}/\`，再把路径填进 \`input_references\`。`,
    `- 生成后系统会自动把预览图拿给你看，你确认效果没翻车后，必须调用 ${sendFile.name} 把生成的图发到聊天里。画图花老板真金白银，一次把 prompt 写好（主体、风格、光影、构图），别瞎重试。`,
    ctx.has(imageKeyLimit.name) ? "- 有人问画图还剩多少额度，调 get_image_key_limit，查完照实报数。" : "",
  ];
  return `# 画图、发自拍与修图（generate_image）\n\n${lines.filter(Boolean).join("\n")}`;
}

/** Called once by compose() (src/composition.ts), after every file has loaded and the persona is in place. */
export function imageModule(): Module {
  return {
    id: "image",
    label: "画图",
    summary: "generate_image 画图、修图、发自拍，结果存进沙盒工作区。",
    requires: ["sandbox"],
    capability: imageCapability,
    config: imageSettings(),
    tools: [generateImage, imageKeyLimit],
    section: { order: 5500, text: guide },
    meter: { key: "images", label: "画图（张）", tools: [generateImage.name] },
    balance: imageBalance,
  };
}
