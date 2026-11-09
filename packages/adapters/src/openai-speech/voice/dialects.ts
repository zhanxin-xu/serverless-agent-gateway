/**
 * What each speech model family understands, and how it is asked to sing: the
 * provider's dialect (docs/design/modules.md 6.3). Chosen by TTS_MODEL.
 */
export interface ModelKind {
  /** For the description: who it is and what it's good at. */
  about: string;
  /** For the description: how to write `text` and `instructions` for it. */
  syntax: string;
  /** The same, in one line of the system prompt. */
  hint: string;
  /** Singing: what goes around the lyrics and into `instructions`. */
  sing: { input(text: string): string; instructions: string; defaultStyle: string };
  /** Whether it honors `speed`. */
  speed: boolean;
}

export const FISH: ModelKind = {
  about: "Fish Audio Drama 3. Singing comes out closer to a lilting recitation than a real melody.",
  hint: "现在是 Fish 模型：可在 `text` 里用 `[得意地]`、`[小声嘀咕]`、`[叹气]`、`[轻笑]`、`<whisper>…</whisper>` 等行内指令（每句不超两三个）及 `speed`。",
  syntax:
    "Directions inside `text` (not read out):\n" +
    "  - [方括号] before the words it applies to: how to say them, in plain words, Chinese or English, like briefing a voice actor: " +
    "[得意地] 本鱼早就算到了！ / [小声嘀咕] 才不是因为想你呢。 / [像发现宝藏一样兴奋] 快看快看！ It lasts until the next direction.\n" +
    "  - [方括号] where a sound or a pause happens: 好吧 [叹气] 我输了。 / [轻笑] / [吸一口气] / [短暂停顿].\n" +
    "  - Paired tags change only the words inside: <whisper>…</whisper>, <emphasis>…</emphasis>, <soft>…</soft>, <fast>…</fast>, " +
    "<slow>…</slow>, <stress>…</stress>, <forceful>…</forceful>. E.g. 这个秘密<whisper>只告诉你一个人</whisper>。\n" +
    "  - A phrase in another language: <english>…</english>, <japanese>…</japanese>, <korean>…</korean> (experimental).\n" +
    "  - A tricky reading (多音字, names): one pinyin syllable with its tone number per tag, " +
    "e.g. <|phoneme_start|>chong2<|phoneme_end|><|phoneme_start|>qing4<|phoneme_end|> for 重庆.\n" +
    "  - A few directions per message, at most about three per sentence; the voice is already lively without them.\n" +
    "  `instructions` sets the mood of the whole message. `speed` works.",
  sing: {
    input: (text) => `[唱歌] ${text}${text.endsWith("♪") ? "" : " ♪"}`,
    instructions: "这是一段歌唱：按旋律和节奏唱出来，音高起伏明显，长音拖住，不要念白",
    defaultStyle: "欢快的儿歌旋律",
  },
  speed: true,
};

export const SEED: ModelKind = {
  about: "ByteDance Seed Audio 1.0: freer, more varied delivery; the clone is a little looser.",
  hint: "现在是 Seed 模型：**不要**在 `text` 里写任何括号或标签（会被念出来），把语气演出全都写进 `instructions`。",
  syntax:
    "Write `text` as plain words to be spoken or sung, no [brackets] or <tags> (they may be read out). " +
    "Put all direction in `instructions`, as a description of the performance: " +
    "\"用撒娇的语气，越说越委屈\", \"像深夜电台主持人一样慢慢讲\". `speed` is ignored.",
  sing: {
    input: (text) => text,
    instructions: "用参考音频里的声音唱歌：按旋律和节奏唱，有明确的音高起伏，长音拖住，是唱歌不是说话",
    defaultStyle: "欢快可爱的儿歌",
  },
  speed: false,
};

/** Any other model: no inline syntax assumed. */
export const GENERIC: ModelKind = {
  about: "An OpenAI-compatible speech model.",
  hint: "`text` 只写要念出来的字，语气写进 `instructions`。",
  syntax: "Write `text` as plain words; put direction in `instructions`.",
  sing: { input: (text) => text, instructions: "唱出来，有旋律和节奏，不要念白", defaultStyle: "欢快的旋律" },
  speed: true,
};

export function kindOf(model: string): ModelKind {
  if (model.startsWith("fish-audio/")) return FISH;
  if (model.startsWith("bytedance-seed/")) return SEED;
  return GENERIC;
}
