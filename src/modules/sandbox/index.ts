/**
 * The workspace: run code, read and write files, take in attachments, send files out.
 *
 * Other modules that require it (image) use the workspace through what this
 * file exports, never through the module's own files.
 */
// For modules that require the sandbox: where the workspace is mounted, and the chat's workspace in this run.
// First, so the leaf paths.js is loaded before anything that reads WORKDIR while loading.
export { WORKDIR } from "./paths.js";
export { workspaceFor, type Workspace } from "./workspace.js";
import type { Module } from "../types.js";
import { CONFIG } from "./settings.js";
import { sandboxCapability } from "./capability.js";
import { bash, readFile, saveAttachment, sendFile, writeFile } from "./tools.js";

const GUIDE = `# 沙盒工作区与附件（save_attachment / bash / read_file / write_file / send_file）

- \`/workspace\` 是这个聊天的持久盘，装过的包（pip / npm -g）和写过的文件下次还在；其他目录每轮清空。
- **处理别人发的原图/文件/音视频**：聊天里你直接看到的图片只是 512px 小预览。只要需要处理高清原图、遇到 \`（有图片没加载出来）\`、或者别人发了/引用了 \`[文件：…]\` \`[视频]\` \`[语音]\` 让你看或处理，**不要说打不开**！直接对那条消息调 \`save_attachment(message=N)\` 把原件存进 \`/workspace/inbox/\`，再用 read_file 看图/读文本，或用 bash（python3、ffmpeg、Pillow 等）处理，最后用 send_file（最大 5 MB）把结果发出去。只有当 save_attachment 报错说链接过期时，才让对方重发。
- 对方是引用旧消息发的话：对当前这条消息调 \`save_attachment(message=N)\`，被引用消息里的原图或附件也会存进来（排在这条消息自身附件之后）。
- 自己用代码画的图表，先用 read_file 看一眼没问题再用 send_file 发。拒绝攻击网站、挖矿、刷接口的脏活。`;

/** Called once by compose() (src/composition.ts), after every file has loaded and the persona is in place. */
export function sandboxModule(): Module {
  return {
    id: "sandbox",
    label: "沙盒",
    summary: "bash 跑代码、读写文件、把聊天里的附件存进来、把文件发出去。每个聊天一个持久的工作区。",
    capability: sandboxCapability,
    config: CONFIG,
    tools: [bash, readFile, writeFile, sendFile, saveAttachment],
    section: { order: 5400, text: () => GUIDE },
  };
}
