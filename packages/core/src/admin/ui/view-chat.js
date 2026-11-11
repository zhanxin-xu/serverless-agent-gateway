// One chat (#/chat/<chat>/<tab>): its history with the composer, its event log, and its settings.
import { api, ApiError } from "./api.js";
import { action, confirmAction, copy, empty, every, fill, fmtClock, fmtDay, fmtHm, fmtTokens, fmtUsd, h, pill, section, switchButton, tabs, toast } from "./dom.js";
import { pending } from "./form.js";
import { icon } from "./icons.js";
import { chatKind, chatName, modePill, speakersText } from "./labels.js";

/** The bot's name in this chat's lines and placeholders (the composed persona's, set when the view opens). */
let BOT = "机器人";
const TABS = [
  ["history", "聊天记录"],
  ["events", "事件"],
  ["settings", "设置与额度"],
];

export async function renderChat(main, [chat, tabId], app) {
  BOT = app.botName;
  const info = await api.get("chat", { chat });
  const tab = TABS.some(([id]) => id === tabId) ? tabId : "history";
  const href = (id) => `#/chat/${encodeURIComponent(chat)}/${id}`;
  const body = h("div", { class: `tab-body tab-${tab}`, "data-scroll": tab === "settings" ? "" : null });
  const speakers = info.chatType === "group" ? speakersText(info) : "";
  const metaLine = [chatKind(info), chat, info.turn ? `第 ${info.turn} 轮` : "", speakers ? `最近：${speakers}` : ""].filter(Boolean).join(" · ");
  // The page doesn't scroll: the header and the tabs stay, and the tab's own list takes the rest of the height.
  main.classList.add("fill");
  fill(
    main,
    h(
      "header",
      { class: "chat-head" },
      h("a", { href: "#/chats", class: "icon-btn", title: "返回聊天列表", "aria-label": "返回聊天列表" }, icon("back", 18)),
      h(
        "div",
        { class: "chat-id" },
        h("div", { class: "chat-title" }, h("h1", null, chatName(info)), modePill(info), info.locked ? pill("info", "运行中") : null),
        h("p", { class: "chat-meta", title: metaLine }, metaLine),
      ),
    ),
    tabs(TABS.map(([id, label]) => [href(id), label]), href(tab)),
    body,
  );
  if (tab === "events") return renderEvents(body, chat, info);
  if (tab === "settings") return renderSettings(body, chat, info, app);
  return renderHistory(body, chat, info);
}

// ── History and the composer ──

/** Messages from the same sender within a few minutes read as one run: the name shows once. */
const RUN_MS = 5 * 60_000;

function bubble(e, prev) {
  if (e.role === "hint") {
    return h("div", { class: "msg hint" }, h("span", { class: "who" }, `管理员悄悄话 · ${fmtHm(e.time)}`), h("div", { class: "b" }, e.text));
  }
  const mine = e.role === "bot" || e.role === "admin";
  const who = e.role === "admin" ? `${BOT}（管理员代发）` : mine ? BOT : (e.sender ?? "?");
  const cont = prev && prev.role === e.role && prev.sender === e.sender && e.time - prev.time < RUN_MS;
  return h(
    "div",
    { class: `msg${mine ? " bot" : ""}${e.role === "admin" ? " admin" : ""}${cont ? " cont" : ""}`, title: new Date(e.time).toLocaleString("zh-CN") },
    h("span", { class: "who" }, h("b", null, who), ` ${fmtHm(e.time)}`),
    h("div", { class: "b" }, e.text),
  );
}

/** The messages oldest first, with a line where the day changes. */
function thread(sorted) {
  const out = [];
  let prev;
  for (const e of sorted) {
    const newDay = !prev || new Date(prev.time).toDateString() !== new Date(e.time).toDateString();
    if (newDay) out.push(h("div", { class: "day" }, fmtDay(e.time)));
    out.push(bubble(e, newDay ? undefined : prev));
    prev = e;
  }
  return out;
}

function renderHistory(body, chat, info) {
  const entries = new Map();
  const list = h("div", { class: "chat-log", "aria-live": "polite" });
  const more = h("button", { type: "button", class: "btn btn-small" }, "加载更早的");
  const moreRow = h("div", { class: "more-row" }, more);
  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;

  const draw = (stick) => {
    const sorted = [...entries.values()].sort((a, b) => a.seq - b.seq);
    fill(list, moreRow, sorted.length ? thread(sorted) : empty("还没有消息。"));
    if (stick) list.scrollTop = list.scrollHeight;
  };
  // The newest event read so far: polling asks only for what's after it.
  let through = -1;
  const add = (page) => {
    for (const e of page.lines) entries.set(e.id, e);
    through = Math.max(through, page.through);
    return page;
  };
  more.hidden = true;
  more.addEventListener("click", async () => {
    const oldest = Math.min(...[...entries.values()].map((e) => e.seq));
    const height = list.scrollHeight;
    more.hidden = !add(await api.get("chat/history", { chat, before: oldest, limit: 100 })).more;
    draw(false);
    list.scrollTop = list.scrollHeight - height;
  });

  const composer = renderComposer(chat, info, () => refresh(true));
  fill(body, list, composer.el);
  const refresh = async (stick) => {
    const before = entries.size;
    const wasNear = nearBottom();
    add(await api.get("chat/history", { chat, after: through }));
    if (entries.size !== before || stick) draw(stick || wasNear);
  };
  api
    .get("chat/history", { chat, limit: 100 })
    .then((page) => {
      more.hidden = !add(page).more;
      draw(true);
    })
    .catch((err) => fill(list, empty(`加载失败：${err.message}`)));
  const stops = [every(4000, () => refresh(false)), composer.stop];
  return () => stops.forEach((s) => s());
}

function renderComposer(chat, info, onSent) {
  let mode = "say";
  // A switched-off, record-only or blocked chat never answers, so there's no one to whisper to.
  const canWhisper = info.enabled && (info.mode === "normal" || info.mode === "mention");
  const placeholder = () => (mode === "say" ? `以${BOT}的身份说点什么…  @#XXXXXX 可以 @ 群友` : "告诉她要说什么、怎么说…");
  const text = h("textarea", { id: "compose", rows: 2, placeholder: placeholder(), "aria-label": "消息" });
  const windowLine = h("span", { class: "window" });
  let state = info.replyWindow;

  const hint = () =>
    mode === "say"
      ? "原样发出去，记进她的上下文，她会以为是自己说的。"
      : "写给她的指示（群里看不到），比如“提醒大家今晚 8 点开会”，她会用自己的口气说。";
  const help = h("span", { class: "help" }, hint());
  const seg = h(
    "span",
    { class: "seg", role: "group", "aria-label": "怎么发" },
    [["say", "直接发出"], ["whisper", "让她自己说"]].map(([value, label]) =>
      h("button", {
        type: "button",
        class: value === mode ? "on" : "",
        disabled: value === "whisper" && !canWhisper,
        title: value === "whisper" && !canWhisper ? (info.enabled ? `这个聊天是“${info.modeLabel}”，她不会回复` : "这个聊天关掉了，她不会回复") : null,
        onClick(e) {
          mode = value;
          for (const b of seg.children) b.classList.toggle("on", b === e.currentTarget);
          text.placeholder = placeholder();
          help.textContent = hint();
          text.focus();
        },
      }, label),
    ),
  );
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  let sending = false;
  const send = action(["发送 ", h("span", { class: "small" }, mac ? "⌘↵" : "Ctrl ↵")], async () => {
    if (!text.value.trim()) return;
    sending = true;
    try {
      if (mode === "say") await api.post("chat/say", { chat, text: text.value });
      else await api.post("chat/whisper", { chat, text: text.value });
      text.value = "";
      toast(mode === "say" ? "已发送" : "已告诉她，等她回复");
      await pollWindow();
      onSent();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) await pollWindow().catch(() => {});
      throw err;
    } finally {
      sending = false;
      // After action() has enabled the button again, it follows the reply window.
      setTimeout(tick, 0);
    }
  }, { primary: true });
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !send.disabled) {
      e.preventDefault();
      send.click();
    }
  });

  /** Whether a message can go out now, and how (the channel's reply window); the button follows. */
  let sendable = true;
  const drawWindow = () => {
    sendable = false;
    if (!info.canSend) return fill(windowLine, pill("mute", "这个渠道不能主动发消息"));
    if (!state?.open) return fill(windowLine, pill("warn", "现在发不出去"), " ", state?.reason ?? "");
    sendable = true;
    const left = state.closesAt ? Math.max(0, Math.floor((state.closesAt - Date.now()) / 1000)) : null;
    // Past the reply window: it goes to the chat as a message of its own, if the chat allows that.
    if (state.push) return fill(windowLine, pill("info", "作为主动消息发出"), ` 回复窗口已过 · 还能发 ${state.max - state.replies} 条`);
    fill(
      windowLine,
      pill("info", `挂在第 ${state.seq} 条（${state.sender}）上`),
      ` ${left !== null ? `窗口剩 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} · ` : ""}还能发 ${state.max - state.replies} 条`,
    );
  };
  const tick = () => {
    drawWindow();
    // While a send is under way the button stays as action() left it: disabled.
    if (!sending) send.disabled = !sendable;
  };
  const pollWindow = async () => {
    state = await api.get("chat/reply-window", { chat });
    tick();
  };
  tick();
  const stops = [every(1000, tick), every(10_000, pollWindow)];
  const el = h("div", { class: "composer" }, h("div", { class: "row between" }, seg, windowLine), text, h("div", { class: "row between" }, help, send));
  return { el, stop: () => stops.forEach((s) => s()) };
}

// ── Events ──

const REASONS = {
  completed: ["ok", "完成"],
  "max-steps": ["warn", "步数用完"],
  "out-of-time": ["warn", "时间用完"],
  error: ["bad", "出错"],
  paused: ["info", "交给下一个函数"],
  interrupted: ["warn", "被打断"],
  unreachable: ["bad", "平台连不上"],
};

/** A model call's usage (src/llm/types.ts): the whole prompt, the cached part, the output, the cost. */
const promptTokens = (u) => (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0);
const usageLine = (u) =>
  ` · 输入 ${fmtTokens(promptTokens(u))}（缓存 ${fmtTokens(u.cacheRead)}）输出 ${fmtTokens(u.output)}${u.cost?.total ? ` · ${fmtUsd(u.cost.total)}${u.cost.totalFromProvider ? "" : "（估算）"}` : ""}`;

/** An assistant message's blocks, briefly: its reasoning, what it wrote, which tools it called. */
function messageSummary(message) {
  const parts = [];
  const content = message?.content ?? [];
  const thinking = content.filter((b) => b.type === "thinking").length;
  if (thinking) parts.push(pill("mute", `思考 ${thinking} 段`));
  for (const block of content) {
    if (block.type === "text" && block.text) parts.push(`“${block.text}”`);
    if (block.type === "toolCall") parts.push(h("code", null, `${block.name}(${JSON.stringify(block.arguments ?? {})})`));
  }
  return parts.flatMap((p, i) => (i ? [" ", p] : [p]));
}

function summarize(e) {
  const d = e.data;
  switch (e.type) {
    case "user/message":
      return [
        h("b", null, d.sender),
        "：",
        d.text,
        d.images?.length ? ` [图片×${d.images.length}]` : "",
        d.mentioned ? [" ", pill("info", "@")] : null,
        d.quiet ? [" ", pill("mute", "只记录")] : null,
        d.replyVia ? [" ", pill("info", "悄悄话")] : null,
      ];
    case "user/mentioned":
      return "这条消息又以 @ 推送了一次";
    case "session/reset":
      return "上下文清空";
    case "turn/start":
      return d.trigger === "direct" ? "开始（被 @ 或私聊）" : "开始（旁观）";
    case "turn/end":
      return [pill(...(REASONS[d.reason] ?? ["mute", d.reason])), d.error ? ` ${d.error}` : ""];
    case "step/start":
      return `第 ${d.step} 步`;
    case "step/end":
      return `第 ${d.step} 步结束`;
    case "developer/message":
      return h("span", { class: "muted" }, d.text);
    case "assistant/message": {
      const u = d.message?.usage;
      return [messageSummary(d.message), u ? h("span", { class: "faint" }, usageLine(u)) : null];
    }
    case "assistant/attempt":
      return [pill("bad", "调用失败"), ` ${d.error}`];
    case "tool/call":
      return h("code", null, d.name);
    case "tool/result":
      return d.output.startsWith("Error:") ? [pill("bad", "失败"), ` ${d.output}`] : d.output;
    case "tool/images":
      return `工具返回了 ${d.images.length} 张图片`;
    case "compaction/summary":
      return `压缩了第 ${d.fromSeq} 条之前的内容：${d.summary}`;
    case "admin/message":
      return [pill("info", "管理员代发"), ` ${d.text}`];
    case "bot/sent":
      return [pill("ok", "已发出"), ` ${d.text}`];
    default:
      return "";
  }
}

/** The dot before an event's type: who wrote it. */
const typeKind = (e) => (e.type === "assistant/attempt" ? "bad" : e.type.split("/")[0]);

/**
 * The events in the order the model reads them, oldest first: the compaction
 * summary first; what arrived while a step ran right after that step (the
 * server marks it: readAfter = the step/end it follows, readAfterStep while
 * the step runs); everything else as logged.
 */
function inModelOrder(events) {
  const position = (e) => (e.readFirst ? [-Infinity, 0] : e.readAfter !== undefined ? [e.readAfter, 1] : e.readAfterStep ? [Infinity, 1] : [e.seq, 0]);
  return [...events].sort((a, b) => {
    const [pa, ma] = position(a);
    const [pb, mb] = position(b);
    return pa - pb || ma - mb || a.seq - b.seq;
  });
}

/**
 * One group per turn as the model saw it, oldest first: a group closes with
 * the turn's end (end_turn, or an error, a pause…). Messages read after the
 * turn's last step (they came in while it ran) were read after its end_turn,
 * so they open the next group, as the messages that turn handles. Only what
 * the model read or wrote is listed; the log's own markers (turn/start,
 * steps, tool-call markers…) only set the header.
 */
function turnsAsRead(ordered) {
  const groups = [];
  let group = { lines: [], log: [] };
  // Messages read after a step ended: they belong to this turn if another step follows, else to the next.
  let held = [];
  for (const e of ordered) {
    if (e.type === "step/start") {
      group.lines.push(...held);
      held = [];
    }
    if (e.type === "turn/end") {
      group.log.push(e);
      groups.push(group);
      group = { lines: held, log: [] };
      held = [];
      continue;
    }
    group.log.push(e);
    const arrived = e.type === "user/message" || e.type === "admin/message";
    if (e.modelSees && arrived && group.log.some((x) => x.type === "step/end")) held.push(e);
    else if (e.modelSees) group.lines.push(e);
  }
  group.lines.push(...held);
  if (group.lines.length) groups.push(group);
  return groups;
}

function turnHeader(group) {
  const start = group.log.find((e) => e.type === "turn/start");
  const end = group.log.find((e) => e.type === "turn/end");
  const turn = end?.data.turn ?? start?.data.turn;
  if (turn === undefined) return h("div", { class: "turn-head" }, h("b", null, "等着下一轮"));
  const steps = group.log.filter((e) => e.type === "step/start").length;
  const endUsers = [...new Set(group.log.filter((e) => e.type === "step/start" && e.data.endUser).map((e) => e.data.endUser))];
  let input = 0, cached = 0, output = 0, cost = 0;
  for (const e of group.log) {
    const u = e.type === "assistant/message" ? e.data.message?.usage : undefined;
    if (!u) continue;
    input += promptTokens(u);
    cached += u.cacheRead ?? 0;
    output += u.output ?? 0;
    cost += u.cost?.total ?? 0;
  }
  return h(
    "div",
    { class: "turn-head" },
    h("b", null, `第 ${turn} 轮`),
    start ? h("span", null, start.data.trigger === "direct" ? "被叫" : "旁观") : null,
    h("span", null, `${steps} 步`),
    h("span", null, `输入 ${fmtTokens(input)}（缓存 ${fmtTokens(cached)}）· 输出 ${fmtTokens(output)}`),
    cost ? h("span", null, fmtUsd(cost)) : null,
    // Who the turn's model calls were for, as the provider saw them (a warning names them by it).
    endUsers.length ? h("span", { class: "faint", title: "发给模型服务的用户标识（安全标识）" }, `标识 ${endUsers.join("、")}`) : null,
    h("span", { class: "end" }, end ? pill(...(REASONS[end.data.reason] ?? ["mute", end.data.reason])) : pill("info", "进行中")),
  );
}

function eventRow(e) {
  // The JSON is built when the row is first opened: a long log has thousands of lines of it.
  const detail = h("div", { class: "json-wrap", hidden: true });
  const row = h(
    "div",
    { class: "ev", tabindex: "0", role: "button", "aria-expanded": "false" },
    h("span", { class: "seq" }, e.seq),
    h("span", { class: "time" }, fmtClock(e.time)),
    h("span", { class: `type ${typeKind(e)}` }, e.type),
    h("span", { class: "what" }, summarize(e), e.readAfter !== undefined || e.readAfterStep ? h("span", { class: "faint small" }, " · 处理中途收到") : null),
  );
  const toggle = () => {
    if (!detail.firstChild) {
      const text = JSON.stringify(e, null, 2);
      const pre = h("pre", { class: "json" }, text);
      detail.append(h("button", { type: "button", class: "btn btn-small", onClick: () => copy(text, pre) }, "复制"), pre);
    }
    detail.hidden = !detail.hidden;
    row.setAttribute("aria-expanded", String(!detail.hidden));
  };
  row.addEventListener("click", () => getSelection()?.isCollapsed !== false && toggle());
  row.addEventListener("keydown", (ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), toggle()));
  return h("div", null, row, detail);
}

function renderEvents(body, chat, info) {
  const events = new Map();
  let session = null;
  // Oldest at the top, newest at the bottom, like a chat: scroll up for earlier turns.
  const list = h("div", { class: "events-log" });
  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const meta = h("span");
  const more = h("button", { type: "button", class: "btn btn-small" }, "加载更早的");
  const moreRow = h("div", { class: "more-row" }, more);
  // A row that's open stays open across redraws (the list is rebuilt every few seconds).
  const rows = new Map();
  const rowOf = (e) => {
    const key = `${e.seq}:${e.readAfter ?? ""}:${e.readAfterStep ?? ""}`;
    if (!rows.has(key)) rows.set(key, eventRow(e));
    return rows.get(key);
  };

  /** Redraw; `keep`: "bottom" to follow new events, "top-anchor" to keep the view when older ones are added above. */
  const draw = (keep = nearBottom() ? "bottom" : "stay") => {
    const fromBottom = list.scrollHeight - list.scrollTop;
    const top = list.scrollTop;
    const groups = turnsAsRead(inModelOrder(events.values()));
    meta.textContent = !session ? "" : session.minSeq > 0 ? `共 ${session.nextSeq} 条事件，第 ${session.minSeq} 条之前的已压缩成摘要` : `共 ${session.nextSeq} 条事件`;
    more.hidden = !events.size || Math.min(...events.keys()) <= (session?.minSeq ?? 0);
    fill(
      list,
      moreRow,
      groups.length ? groups.map((g) => (g.lines.length ? h("section", { class: "turn" }, turnHeader(g), g.lines.map(rowOf)) : null)) : empty("没有事件。"),
    );
    if (keep === "bottom") list.scrollTop = list.scrollHeight;
    else if (keep === "top-anchor") list.scrollTop = list.scrollHeight - fromBottom;
    else list.scrollTop = top;
  };
  const load = async (params) => {
    const page = await api.get("chat/events", { chat, limit: 150, ...params });
    session = page.session ?? session;
    for (const e of page.events) events.set(e.seq, e);
    return page.events.length;
  };
  // Poll from the start of a step that's still running, so a message that came in during it moves into place when it ends.
  const pollFrom = () => {
    let from = -1;
    let running = null;
    for (const e of [...events.values()].sort((a, b) => a.seq - b.seq)) {
      from = e.seq;
      if (e.type === "step/start") running = e.seq;
      else if (e.type === "step/end") running = null;
    }
    return running !== null ? running - 1 : from;
  };
  more.addEventListener("click", async () => {
    const oldest = Math.min(...events.keys());
    if (!(await load({ before: oldest }))) more.hidden = true;
    draw("top-anchor");
  });

  fill(
    body,
    h(
      "div",
      { class: "toolbar" },
      h(
        "span",
        null,
        meta,
        h("span", { class: "faint", title: "只列模型读到和写出的内容，按它读的顺序；每次 end_turn（或一轮结束）为一组。最新的在下面，往上翻看更早的。每 3 秒刷新。" }, " · 按模型读的顺序，每轮一组；点一行看原始 JSON"),
      ),
      h(
        "span",
        { class: "row" },
        info.locked ? confirmAction("释放锁", "正在跑的一轮会在下一步停下，确定？", async () => {
          const { released } = await api.post("chat/unlock", { chat });
          toast(released ? "已释放" : "没有锁");
        }) : null,
        confirmAction("重置上下文", "她会忘掉之前的对话，事件和聊天记录都会清空，确定？", async () => {
          await api.post("chat/reset", { chat });
          toast("已重置");
          events.clear();
          rows.clear();
          await load();
          draw();
        }),
      ),
    ),
    list,
  );
  load()
    .then(() => draw("bottom"))
    .catch((err) => fill(list, empty(`加载失败：${err.message}`)));
  return every(3000, async () => {
    if ((await load({ after: pollFrom() })) > 0) draw();
  });
}

// ── Settings and quotas ──

/** How today's count of a quota reads: dollars for cost, a number for the rest. */
const showCount = (key, n) => (key === "cost_usd" ? fmtUsd(n) : String(n));

/** What each reply mode does, under the choice (the labels come from the server). */
const MODE_HELP = {
  normal: "被 @ 必回，平时偶尔插话。",
  mention: "只在被 @ 时回，不插话。",
  record: "一律不回，消息留作以后的上下文。",
  block: "不回，连记录都不存。",
};

function renderSettings(body, chat, info, app) {
  const p = info.profile ?? {};
  const { modes, features, quotas: quotaChoices } = info.choices;
  const labelOf = (value) => modes.find((o) => o.value === value)?.label ?? value;
  const today = info.usageByDay.at(-1)?.day === new Date().toISOString().slice(0, 10) ? info.usageByDay.at(-1).counts : {};
  const errors = {};
  const errorSlot = (key) => (errors[key] = h("p", { class: "field-error", hidden: true }));
  /** A row like the settings forms': what it is on the left, the control on the right. */
  const row = (id, label, help, control, key = id) =>
    h("div", { class: "set-row" }, h("div", { class: "about" }, h(id ? "label" : "span", id ? { for: `profile-${id}` } : { class: "label" }, label), help ? h("p", { class: "help" }, help) : null), h("div", { class: "ctl" }, control, errorSlot(key)));

  let enabledNow = p.enabled !== false;
  const enabledText = h("span");
  const enabled = switchButton({
    on: enabledNow,
    label: "处理这个聊天的消息",
    // Not saved by the click: it's one of the form's fields, sent with "保存".
    onToggle() {
      enabledNow = !enabledNow;
      enabled.classList.toggle("on", enabledNow);
      enabled.setAttribute("aria-checked", String(enabledNow));
      drawEnabled();
      changed();
    },
  });
  const drawEnabled = () => (enabledText.textContent = enabledNow ? "在处理" : "已关闭：消息一律跳过");
  drawEnabled();
  const title = h("input", { id: "profile-title", type: "text", value: p.title ?? "", maxlength: 60, placeholder: "比如：技术交流群" });
  const mode = h(
    "select",
    { id: "profile-mode" },
    h("option", { value: "", selected: !p.mode }, `跟随默认（${labelOf(info.defaults.mode)}）`),
    modes.map((o) => h("option", { value: o.value, selected: p.mode === o.value }, o.label)),
  );
  const modeHelp = h("p", { class: "help" });
  const drawModeHelp = () => (modeHelp.textContent = MODE_HELP[mode.value || info.defaults.mode] ?? "");
  drawModeHelp();
  mode.addEventListener("change", drawModeHelp);
  const interval = h("input", { id: "profile-interval", type: "text", inputmode: "numeric", value: p.ambientIntervalSeconds ?? "", placeholder: `默认 ${info.defaults.ambientIntervalSeconds}` });
  const disabled = new Set(p.disabledModules ?? []);
  const tools = features.map(({ value: id, label }) => {
    const box = h("input", { id: `profile-tool-${id}`, type: "checkbox", checked: !disabled.has(id) });
    return { id, box, el: h("label", { class: "check", for: `profile-tool-${id}` }, box, label) };
  });
  const prompt = h("textarea", { id: "profile-prompt", rows: 4, maxlength: 2000, placeholder: "比如：这是一个研究海洋生物的群，说话可以更学术一点。" });
  prompt.value = p.prompt ?? "";
  const quotas = quotaChoices.map(({ value: key, label }) => {
    const input = h("input", { id: `profile-quota-${key}`, type: "text", inputmode: "decimal", value: p.quota?.[key] ?? "", placeholder: "不限", "aria-label": `${label}上限` });
    return { key, input, row: h("tr", null, h("td", null, h("label", { for: `profile-quota-${key}` }, label)), h("td", { class: "num" }, showCount(key, today[key] ?? 0)), h("td", null, input, errorSlot(`quota.${key}`))) };
  });

  /** The profile as the form has it now; what's sent, and what "changed" compares. */
  const read = () => ({
    title: title.value,
    enabled: enabledNow,
    mode: mode.value || null,
    ambientIntervalSeconds: interval.value.trim() || null,
    disabledModules: tools.filter((t) => !t.box.checked).map((t) => t.id),
    prompt: prompt.value,
    quota: Object.fromEntries(quotas.map((q) => [q.key, q.input.value.trim() || null])),
  });
  const flat = (profile) => ({ ...profile, quota: undefined, ...Object.fromEntries(Object.entries(profile.quota).map(([k, v]) => [`quota.${k}`, v])) });
  const initial = flat(read());
  const count = () => Object.entries(flat(read())).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(initial[k])).length;
  const state = h("span", { class: "state" });
  const bar = h("div", { class: "savebar" });
  const changed = () => {
    const n = count();
    bar.classList.toggle("dirty", n > 0);
    fill(state, n ? [`${n} 项改动没保存 `, h("button", { type: "button", class: "link", onClick: () => app.go(`#/chat/${encodeURIComponent(chat)}/settings`) }, "撤销")] : "");
  };

  const send = async () => {
    for (const slot of Object.values(errors)) slot.hidden = true;
    try {
      await api.put("chat/profile", { chat, profile: read() });
    } catch (err) {
      if (err instanceof ApiError) {
        for (const [key, message] of Object.entries(err.fields)) {
          const slot = errors[key];
          if (slot) (slot.hidden = false), (slot.textContent = message);
        }
      }
      throw err;
    }
    toast("已保存，30 秒内生效");
  };
  const save = action("保存", async () => {
    if (!count()) return toast("没有改动");
    await send();
    pending.clear();
    app.go(`#/chat/${encodeURIComponent(chat)}/settings`);
  }, { primary: true });
  pending.add({ count, save: send, click: () => save.click() });

  const maxCost = Math.max(0.0001, ...info.usageByDay.map((d) => d.counts.cost_usd ?? 0));
  const form = h(
    "form",
    { class: "set", onSubmit: (e) => e.preventDefault(), onInput: changed, onChange: changed },
    h(
      "div",
      { class: "set-row" },
      h("div", { class: "about" }, h("span", { class: "label" }, "处理这个聊天的消息"), h("p", { class: "help" }, "关掉后，这个聊天发来的消息一律跳过：不记录、不回复。下面的回复方式保留，重新打开后照旧。")),
      h("div", { class: "ctl" }, h("label", { class: "switch-row" }, enabled, enabledText), errorSlot("enabled")),
    ),
    row("title", "备注名", "平台不提供群名时，起个好认的名字。", title),
    row("mode", "回复方式", null, [mode, modeHelp]),
    row("interval", "插话频率（秒）", "群里没 @ 的消息，每这么多秒最多给她看一次。0 = 不插话。", interval),
    row(null, "能用的模块", "关掉的模块，它的工具和说明都不会出现在这个聊天发给模型的请求里。没配置好的模块本来就不会出现，见“模块”页。", h("div", { class: "checks" }, tools.map((t) => t.el)), "disabledModules"),
    row("prompt", "额外设定", "加在系统提示后面，只对这个聊天生效。", prompt),
    bar,
  );
  fill(bar, save, h("span", { class: "spacer" }), state);
  changed();

  fill(
    body,
    h(
      "div",
      { class: "chat-settings" },
      h("div", { class: "stack" }, form, promptPreview(chat)),
      h(
        "div",
        { class: "stack" },
        section(
          "每日额度",
          "北京时间 08:00 重置",
          h(
            "div",
            { class: "table-wrap quota" },
            h("table", { onInput: changed }, h("thead", null, h("tr", null, h("th", null, "项目"), h("th", { class: "num" }, "今日"), h("th", null, "上限"))), h("tbody", null, quotas.map((q) => q.row))),
          ),
          h("p", { class: "help" }, "模型花费用完后：被 @ 时回一句“今天的额度用完了”，平时不插话。其他额度用完时只是那个模块的工具不能用，她会自己说明。改了上限也要点左边的“保存”。"),
        ),
        section(
          "近 7 天模型花费",
          null,
          h(
            "div",
            { class: "panel pad" },
            h(
              "div",
              { class: "bars" },
              info.usageByDay.map((d) =>
                h("div", { class: "bar-col", title: `${d.day}：${fmtUsd(d.counts.cost_usd ?? 0)}，${d.counts.turns ?? 0} 轮` }, h("span", null, d.counts.cost_usd ? fmtUsd(d.counts.cost_usd) : ""), h("i", { style: `height:${Math.max(2, ((d.counts.cost_usd ?? 0) / maxCost) * 100)}%` }), h("span", null, d.day.slice(5))),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

/** What the model is told and given in this chat now, section by section (GET chat/prompt), loaded when opened. */
function promptPreview(chat) {
  const body = h("div", { class: "stack" });
  const el = h("details", { class: "more" }, h("summary", null, "看这个聊天的系统提示和工具（模型实际收到的）"), body);
  let loaded = false;
  el.addEventListener("toggle", async () => {
    if (!el.open || loaded) return;
    loaded = true;
    fill(body, h("p", { class: "faint" }, "加载中…"));
    try {
      const a = await api.get("chat/prompt", { chat });
      fill(
        body,
        h("p", { class: "help" }, `共 ${a.chars} 字，${a.sections.length} 段；开启的模块：${a.modules.join("、")}；工具 ${a.tools.length} 个：${a.tools.map((t) => t.name).join("、")}。保存设置后最多 30 秒生效。`),
        a.sections.map((s) => [h("h3", null, s.source, " ", h("span", { class: "faint small" }, `${s.name} · ${s.text.length} 字`)), h("pre", { class: "code text" }, s.text)]),
      );
    } catch (err) {
      loaded = false;
      fill(body, h("p", { class: "field-error" }, err.message));
    }
  });
  return el;
}
