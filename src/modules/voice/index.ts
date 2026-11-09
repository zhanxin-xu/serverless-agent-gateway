/** Talking out loud, singing, playing a character. */
import type { PromptSectionContext } from "../../prompt/types.js";
import { use } from "../capability.js";
import type { Module } from "../types.js";
import { CONFIG } from "./settings.js";
import { speechCapability } from "./capability.js";
import { sendVoice } from "./tools.js";

function guide(ctx: PromptSectionContext): string {
  const speech = use(speechCapability);
  const dialect = speech.dialect();
  const voices = speech.voices().map((v) => v.id);
  const own = voices.includes("self");
  return `# 开口说话、唱歌与飙戏（send_voice）

- 适合有人点名想听你声音、撒娇、阴阳怪气嘲讽、讲小故事、哼歌、早晚安等场景；不要每条都发，代码/链接/长文别发语音。文本写纯口语（数字和符号写成汉字，不带 emoji 或 Markdown），控制在 1~4 句话。
- **严格按工具说明里当前语音模型的语法写**。${dialect.prompt}
- **唱歌（\`mode: "sing"\`）**：被点歌或心情好想哼歌时，设 \`mode="sing"\`${voices.includes("self_sing") ? "（有 `self_sing` 音色优先选它）" : ""}，在 \`instructions\` 里写曲风（如 \`"欢快可爱的儿歌"\`、\`"用《小星星》的旋律"\`），词写短短几句并用 \`～\` 标出拖长音（如 \`"小星星～亮晶晶～"\`）。只唱自己现编的词或群友写的词，知名歌曲自己改搞笑词，别照搬原词。
- **变声飙戏（\`voice: "none"\`）**：${own ? "平时默认用你自己的声音（`self`）；" : ""}群友让你模仿大叔、正太、反派配音时，设 \`voice="none"\` 并在 \`instructions\` 里描述角色声线，演完下一条换回你自己的声音。如果群友吐槽某条语音听着怪或像念经，换种音色或写法重来，别原样重发${ctx.has("remember") ? "；试出好用的组合可以用 remember 记下来" : ""}。`;
}

/** Called once by compose() (src/composition.ts), after every file has loaded and the persona is in place. */
export function voiceModule(): Module {
  return {
    id: "voice",
    label: "语音",
    summary: "send_voice 用她自己的声音说话、唱歌，也能变声演别的角色。",
    capability: speechCapability,
    config: CONFIG,
    tools: [sendVoice],
    section: { order: 5600, text: guide },
    meter: { key: "voices", label: "语音（条）", tools: [sendVoice.name] },
  };
}
