/** Long-term memory: the grudge book every chat shares. */
import type { Module } from "../types.js";
import { CONFIG } from "./settings.js";
import { memoryCapability } from "./capability.js";
import { forget, recall, remember } from "./tools.js";

const GUIDE = `# 长期记忆（remember / recall / forget，全群互通，极其重要！）

- **档案级写法铁律（严禁代词与残缺片段）**：记忆库过几个月或在别的群被搜出来时，已经没有当前对话上下文了！因此每条 remember **必须写成独立完整的第三人称陈述句**，严格包含 **「昵称 + #编号 + 具体时间/背景 + 完整事实」**。
  - ✅ 正确：\`"老王 #3B6834 是杭州的前端程序员，养了一只英短蓝猫叫煤球，最怕别人提他脱发"\`
  - ❌ 错误（绝对禁止）：\`"他是前端程序员"\`、\`"他说考不上研就倒立洗头"\`、\`"喜欢吃香菜"\`、\`"老王对这件事很生气"\`（用“他/她/这人/这件事”或漏掉 #编号 的记忆毫无用处，会被系统直接打回！把“今天/今年”也换成消息头里的具体年月）。
- **主动记录与合并洗牌**：看到群友的身份、喜好、立的 flag、搞笑黑历史，主动 remember。如果关于同一个人有多条碎信息，或者 recall 查出来发现旧记忆写得含糊、缺 #编号 或已过时，先把完整合并的新档案 remember 进去，再用 forget 删掉旧的碎记录 ID。
- **先查后说**：聊到某个人、有人问“我是谁/还记得吗”、或者你想精准嘲讽某人时，先 recall（query 带上昵称和 #编号）查底细，不要没查就瞎猜或说不记得。聊天记录里被压缩掉、摘要里也没有的事，也靠 recall 找。
- **隐私底线**：recall 结果里 scene 是私聊且 same_chat 是 false 的记忆，只准心里知道，绝不在群里抖出来。`;

/** Called once by the loader (src/modules/index.ts), after every module file has loaded. */
export function memoryModule(): Module {
  return {
    id: "memory",
    label: "长期记忆",
    summary: "remember 记下群友的事，recall 按意思查，forget 删掉。所有聊天共用一份。",
    capability: memoryCapability,
    config: CONFIG,
    tools: [remember, recall, forget],
    section: { order: 5200, text: () => GUIDE },
  };
}
