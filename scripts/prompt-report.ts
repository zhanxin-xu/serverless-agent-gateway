/**
 * The system prompt before and after the module refactor (docs/design/modules.md 10):
 *
 *   npx tsx scripts/prompt-report.ts            # check: every changed line has a reviewed reason
 *   npx tsx scripts/prompt-report.ts --write    # also write docs/design/prompt-migration-report.md
 *
 * Compares the fixtures in scripts/fixtures/prompt-v1 (the prompt before)
 * with what src/prompt puts together now for the same chat, every module on.
 * A line of the old prompt is "kept" when the new prompt has it verbatim;
 * otherwise it must have a reason in REVIEWED below, or this fails.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

Object.assign(process.env, {
  OPENAI_RESPONSES_API_KEY: "k",
  DEEPSEEK_API_KEY: "k",
  IMAGE_API_KEY: "k",
  TTS_API_KEY: "k",
  UPSTASH_VECTOR_REST_URL: "https://vector.example.com",
  UPSTASH_VECTOR_REST_TOKEN: "k",
  SANDBOX_ENABLED: "1",
});

const { assemble } = await import("../src/prompt/assemble.js");
const { Toolset } = await import("../src/modules/registry.js");
const { channels } = await import("../src/channels/index.js");

/**
 * Why each line that's not kept verbatim changed: a distinctive part of the
 * old line → where it went and why. Reviewed by hand.
 */
const REVIEWED: Array<[string, string]> = [
  // ── Persona and rules: tool names taken out (a module may be off; its own section names its tools) ──
  ["发自拍、画有你自己的图时，用 generate_image", "长相留在人设；用 generate_image + include_self 画自己的部分移到“画图”模块"],
  ["你会主动用 remember 记进档案", "人设里去掉工具名：remember / recall 的用法移到“长期记忆”模块"],
  ["每条 send_message 只发一两句短话", "人设里去掉工具名：“每条消息”；怎么连发由“聊天”模块说明"],
  ["每一步都要调用工具，按以下逻辑自己拿主意", "“每一步都要调用工具”移到“聊天”模块；决策逻辑留在业务规则，不含工具名"],
  ["默认只调用 end_turn 潜水", "业务规则里去掉工具名：“潜水 = 只调用 end_turn”移到“聊天”模块"],
  ["直接只调一次 send_sticker", "业务规则里去掉工具名：“甩一张表情包就结束这一轮”"],
  ["+「得加钱」或「摆烂」+ end_turn", "业务规则里去掉工具名：“就结束这一轮”"],
  ["用 reply_to 指定消息编号，并在第一条回复上加 quote: true", "业务规则只说“引用你要回的那条消息”；reply_to + quote 的用法移到“聊天”模块"],
  ["2. **怎么用工具干活", "改名为“干活的时候别像客服一样汇报”，不含工具"],
  ["纯聊天、抬杠、发语音、甩图罢工", "移到“聊天”模块；去掉“发语音”（语音模块可能关着，它自己的示例说明连招）"],
  ["需要查资料/画图/跑代码/翻记忆/查群成员时", "这一层小标题拆掉：先调工具再说话的规则进“聊天”模块，各工具的用法进各自模块"],
  ["直接调工具（或者边调工具边损一句", "业务规则里去掉“调工具”：改成“直接动手”"],
  ["拿到工具结果后，用你自己的话提炼", "业务规则里去掉工具名：end_turn 的时机由“聊天”模块说明"],
  ["还没看完工具返回的结果前，不要提前调用 end_turn", "并入“聊天”模块“要先用工具查东西或干活时”那一条"],
  ["默认回复目标也按上面的规则跟着变", "去掉括号：“默认回复目标”的规则之前已从提示词删除，这里是遗留引用；其余移到“聊天”模块"],
  // ── Examples: each goes with the module whose tools it shows ──
  ["# 典型反应示例", "示例拆开：只用发消息和表情包的两条进“聊天”模块，语音、记忆的各进各自模块"],
  ["**场景 1（被叫大肥鱼 + 使唤干活）**", "进“聊天”模块的示例，去掉“场景 1”编号"],
  ["→ 动作：调用 send_sticker(name=\"红温了\")", "进“聊天”模块的示例，去掉“动作：”前缀"],
  ["**场景 2（无聊搭讪）**", "进“聊天”模块的示例，去掉“场景 2”编号"],
  ["→ 动作：只调用 send_sticker(name=\"嫌弃\")", "进“聊天”模块的示例，去掉“动作：”前缀"],
  ["**场景 3（被夸奖、求听声音或点歌）**", "进“语音”模块的示例"],
  ["→ 动作：调用 send_voice", "进“语音”模块的示例；换成 Seed 模型时示例改为不写行内标签（之前 Seed 下也给 Fish 写法）"],
  ["**场景 4（看到群友立 flag 或爆黑历史）**", "进“长期记忆”模块的示例"],
  ["→ 动作：调用 remember", "进“长期记忆”模块的示例；quote=true 补上 reply_to=18（quote 要配 reply_to 才知道引用哪条）"],
  // ── The tools guide: one section per module ──
  ["# 工具使用指南", "拆成各模块自己的段落（# 发消息、表情包与结束一轮 / # 长期记忆 / # 查网 / …）"],
  ["- **群成员名单与 @ 喊人（chat_members + @#编号）**：", "私聊里没有别人可 @：这一段只在群聊的“聊天”模块段落里出现"],
  ["但当你想在群里**真 @ 某人触发提醒**", "私聊里没有别人可 @：这一段只在群聊的“聊天”模块段落里出现"],
  ["没发过言也沒被 @ 过的人查不到", "进“聊天”模块，只在群聊出现（私聊里没有别人可 @）；顺手改了繁体错字“沒”"],
  ["- **开口说话、唱歌与飙戏（send_voice）**：", "成为“语音”模块段落的标题"],
  ["如果是 Fish 模型，可在 `text` 里用", "只写当前语音模型的写法（实现提供的 dialect）：Fish 时写 Fish 的，Seed 时写 Seed 的"],
  ["设 `mode=\"sing\"`（有 `dafeiyu_sing` 音色优先选它）", "只在配置了唱歌参考音频（提供 dafeiyu_sing 音色）时提它；没配置时这个音色本来就不存在"],
  ["- **长期记忆（remember / recall / forget", "成为“长期记忆”模块段落的标题"],
  ["看到群友的身份、喜好、立的 flag、搞笑黑历史，主动 remember。", "补一句“这就是你的小本本”，接上人设里的“记进档案”"],
  ["先 recall（query 带上昵称和 #编号）查底细，不要没查就瞎猜或说不记得。", "并入原来“你看到的信息”里“摘要里没有的事要靠 recall”"],
  ["- **画图、发自拍与修图（generate_image）**：", "成为“画图”模块段落的标题"],
  ["必须设置 `include_self=true`！系统会自动", "并入人设里原来的“每次都是同一个你、别凭空描述长相”；只在配置了形象参考图时出现"],
  ["- **沙盒工作区与附件（save_attachment", "成为“沙盒”模块段落的标题"],
  ["- **查网与查账（web_search / web_fetch / get_llm_key_limit / get_search_balance）**", "拆开：查网进“搜索”模块，查余额按归属进“模型”“搜索”“画图”三个模块"],
  ["调 get_llm_key_limit（含聊天 model_key 和画图 image_key", "余额归各自模块：模型 key 由“模型”模块的 get_llm_key_limit 查，画图 key 改由“画图”模块的 get_image_key_limit 查，搜索余额由“搜索”模块的 get_search_balance 查"],
  // ── What she sees: tool names out, the tool parts to their modules ──
  ["「第N条」是消息编号，reply_to 和 save_attachment 都填这个 N", "业务规则里去掉工具名：“要指明某条消息时就用这个 N”"],
  ["只有想在群里 @ 提醒某人时才在 send_message 里写", "@#编号 的用法移到“聊天”模块（群聊）"],
  ["并且对当前这条消息调 `save_attachment(message=N)` 就能把被引用消息", "存被引用消息里的附件，移到“沙盒”模块"],
  ["包括你自己以前调用的工具和结果", "业务规则里去掉工具名：“以前做过的事”；recall 的部分移到“长期记忆”模块"],
  ["若提示「（有图片没加载出来）」或看到「[视频]」", "加载不出来的图片和文件用 save_attachment 处理，移到“沙盒”模块"],
  ["你上一次 end_turn 之后新来的消息", "场景规则里去掉工具名：“你上一轮结束之后”"],
];

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/prompt-v1/${name}`, import.meta.url)), "utf8");
const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** Closest line by shared character pairs (Dice), to show where a changed line went. */
function closest(line: string, candidates: string[]): { line: string; score: number } {
  const pairs = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) ?? 0) + 1);
    return out;
  };
  const a = pairs(line);
  let best = { line: "", score: 0 };
  for (const c of candidates) {
    const b = pairs(c);
    let shared = 0;
    for (const [k, n] of a) shared += Math.min(n, b.get(k) ?? 0);
    const score = (2 * shared) / Math.max(1, line.length - 1 + c.length - 1);
    if (score > best.score) best = { line: c, score };
  }
  return best;
}

interface Changed {
  old: string;
  reason?: string;
  closest: string;
  score: number;
}

const report: string[] = [];
let unreviewed = 0;
let keptTotal = 0;
let changedTotal = 0;
for (const scene of ["private", "group"] as const) {
  for (const channel of ["qq", "telegram", "http"]) {
    const before = fixture(`${scene}-${channel}.txt`);
    const after = assemble({ chatType: scene, channelHint: channels.get(channel)!.promptHint, toolset: new Toolset() });
    const newLines = lines(after.prompt);
    const newSet = new Set(newLines);
    const kept: string[] = [];
    const changed: Changed[] = [];
    for (const old of lines(before)) {
      if (newSet.has(old)) {
        kept.push(old);
        continue;
      }
      const reason = REVIEWED.find(([part]) => old.includes(part))?.[1];
      if (!reason) unreviewed++;
      const near = closest(old, newLines);
      changed.push({ old, reason, closest: near.line, score: near.score });
    }
    const oldSet = new Set(lines(before));
    const added = newLines.filter((l) => !oldSet.has(l));
    keptTotal += kept.length;
    changedTotal += changed.length;
    report.push(
      `## ${scene === "group" ? "群聊" : "私聊"} · ${channel}`,
      "",
      `原样保留 ${kept.length} 行，改写或移走 ${changed.length} 行，新增 ${added.length} 行。旧提示 ${before.length} 字，新提示 ${after.prompt.length} 字。`,
      "",
      "### 改写或移走的行",
      "",
      "| 旧的行 | 原因 | 新提示里最接近的行 |",
      "|---|---|---|",
      ...changed.map((c) => `| ${cell(c.old)} | ${c.reason ? cell(c.reason) : "**未审阅**"} | ${c.score > 0.35 ? cell(c.closest) : "（没有相近的行）"} |`),
      "",
      "### 新增的行",
      "",
      ...added.map((l) => `- ${l}`),
      "",
    );
    if (!process.argv.includes("--write")) {
      for (const c of changed.filter((x) => !x.reason)) console.log(`[${scene}-${channel}] UNREVIEWED: ${c.old}\n    closest (${c.score.toFixed(2)}): ${c.closest}`);
    }
  }
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").slice(0, 160) + (text.length > 160 ? "…" : "");
}

if (process.argv.includes("--write")) {
  const out = fileURLToPath(new URL("../docs/design/prompt-migration-report.md", import.meta.url));
  writeFileSync(
    out,
    [
      "# 提示词迁移对比报告",
      "",
      "由 `npx tsx scripts/prompt-report.ts --write` 生成，不要手改。对比重构前的提示词（`scripts/fixtures/prompt-v1`）和现在 `src/prompt` 为同一个聊天拼出的提示词（全部模块开启）。",
      "",
      "规则：旧提示里的每一行，要么原样出现在新提示里，要么在下面写明原因（原因在 `scripts/prompt-report.ts` 的 `REVIEWED` 里人工审阅）。",
      "",
      `合计（六种组合）：原样保留 ${keptTotal} 行，改写或移走 ${changedTotal} 行，未审阅 ${unreviewed} 行。`,
      "",
      ...report,
    ].join("\n"),
  );
  console.log(`wrote ${out}`);
}
if (unreviewed) {
  console.error(`${unreviewed} changed line(s) have no reviewed reason`);
  process.exit(1);
}
console.log(`prompt report: ${keptTotal} lines kept, ${changedTotal} changed, all reviewed`);
