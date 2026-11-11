// Every chat the bot has seen, most recently active first.
import { api } from "./api.js";
import { ago, every, fill, fmtInt, fmtUsd, h, meter, pageHead, pill } from "./dom.js";
import { icon } from "./icons.js";
import { chatKind, chatName, modePill, speakersText } from "./labels.js";

function quotaCell(c) {
  const limit = c.profile?.quota?.cost_usd;
  const spent = c.usage?.cost_usd ?? 0;
  if (limit === undefined) return h("span", { class: spent ? "" : "faint" }, spent ? fmtUsd(spent) : "—");
  return h("div", { class: "cell-meter" }, meter(limit ? spent / limit : 1), h("span", null, spent >= limit ? "用完了" : `${fmtUsd(spent)} / ${fmtUsd(limit)}`));
}

// What was being looked for survives a visit to one chat and back.
let kind = "all";
let search = "";

export async function renderChats(main) {
  let chats = [];
  const tbody = h("tbody");
  const count = h("span", { class: "faint small" });

  const draw = () => {
    const q = search.trim().toLowerCase();
    const shown = chats.filter(
      (c) =>
        (kind === "all" || c.chatType === kind) &&
        // A provider's end-user id (channel.chat.person) starts with the chat's ref.
        (!q || `${c.profile?.title ?? ""} ${c.chat} ${(c.speakers ?? []).join(" ")}`.toLowerCase().includes(q) || q.startsWith(c.ref)),
    );
    count.textContent = shown.length === chats.length ? `${chats.length} 个聊天` : `${shown.length} / ${chats.length} 个聊天`;
    fill(
      tbody,
      shown.length
        ? shown.map((c) => {
            const href = `#/chat/${encodeURIComponent(c.chat)}/history`;
            const speakers = c.chatType === "group" ? speakersText(c) : "";
            return h(
              "tr",
              { class: "clickable", onClick: (e) => e.target.closest("a") || (location.hash = href) },
              h("td", null, h("a", { class: "name", href }, chatName(c)), h("span", { class: "sub" }, speakers ? `最近：${speakers}` : h("span", { class: "mono" }, c.chat))),
              h("td", { class: "nowrap" }, chatKind(c)),
              h("td", { class: "nowrap" }, modePill(c), c.locked ? [" ", pill("info", "运行中")] : null),
              h("td", { class: "num" }, fmtInt(c.usage?.turns)),
              h("td", null, quotaCell(c)),
              h("td", { class: "faint" }, ago(c.lastActiveAt)),
            );
          })
        : h("tr", null, h("td", { colspan: 6, class: "empty" }, chats.length ? "没有符合条件的聊天。" : "还没有聊天。给机器人发条消息试试。")),
    );
  };

  const seg = h(
    "span",
    { class: "seg", role: "group", "aria-label": "聊天类型" },
    [["all", "全部"], ["group", "群聊"], ["private", "私聊"]].map(([value, label]) =>
      h("button", {
        type: "button",
        class: value === kind ? "on" : "",
        onClick(e) {
          kind = value;
          for (const b of seg.children) b.classList.toggle("on", b === e.currentTarget);
          draw();
        },
      }, label),
    ),
  );
  const filter = h("input", { id: "chat-search", type: "search", value: search, placeholder: "搜备注名、群友、ID，或粘贴安全标识", "aria-label": "搜索聊天", onInput: (e) => ((search = e.target.value), draw()) });

  fill(
    main,
    pageHead({ title: "聊天", sub: "平台不提供群名或昵称时，群下面列出最近说话的人；也可以在聊天的“设置与额度”里起个备注名。" }),
    h("div", { class: "row between" }, h("div", { class: "row" }, seg, h("label", { class: "search" }, icon("search", 15), filter)), count),
    h(
      "div",
      { class: "table-wrap wide" },
      h(
        "table",
        null,
        h("thead", null, h("tr", null, h("th", null, "聊天"), h("th", null, "渠道"), h("th", null, "回复方式"), h("th", { class: "num" }, "今日轮次"), h("th", null, "今日花费"), h("th", null, "最后活跃"))),
        tbody,
      ),
    ),
  );
  const load = async () => {
    chats = await api.get("chats");
    draw();
  };
  await load();
  return every(15_000, load);
}
