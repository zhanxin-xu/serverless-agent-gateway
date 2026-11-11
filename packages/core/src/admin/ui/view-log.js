// What admins changed or sent, newest first.
import { api } from "./api.js";
import { empty, fill, fmtTime, h, pageHead } from "./dom.js";

const ACTIONS = {
  settings: "改了设置",
  schema: "执行 schema.sql",
  profile: "改了聊天设置",
  say: "代发消息",
  whisper: "悄悄话",
  reset: "重置上下文",
  unlock: "释放锁",
};

function detail(entry) {
  const d = entry.detail ?? {};
  if (Array.isArray(d.keys)) return h("span", { class: "tools" }, d.keys.map((k) => h("code", { class: "tag" }, k)));
  if (typeof d.text === "string") return d.text;
  if (d.profile) return h("code", { class: "small" }, JSON.stringify(d.profile));
  if (d.version) return `v${d.version}`;
  return "";
}

// Which kind of entry is listed; kept while the console is open.
let only = "all";

export async function renderLog(main) {
  const entries = await api.get("admin-log");
  const tbody = h("tbody");
  const kinds = [...new Set(entries.map((e) => e.action))];
  if (only !== "all" && !kinds.includes(only)) only = "all";
  const draw = () => {
    const shown = entries.filter((e) => only === "all" || e.action === only);
    fill(
      tbody,
      shown.map((e) =>
        h(
          "tr",
          null,
          h("td", { class: "nowrap faint", title: new Date(e.time).toLocaleString("zh-CN") }, fmtTime(e.time)),
          h("td", { class: "nowrap" }, ACTIONS[e.action] ?? e.action),
          h("td", null, e.chat ? h("a", { href: `#/chat/${encodeURIComponent(e.chat)}/history` }, e.chat) : h("span", { class: "faint" }, "—")),
          h("td", { class: "wrap" }, detail(e)),
        ),
      ),
    );
  };
  const seg = h(
    "span",
    { class: "seg", role: "group", "aria-label": "操作类型" },
    [["all", "全部"], ...kinds.map((k) => [k, ACTIONS[k] ?? k])].map(([value, label]) =>
      h("button", {
        type: "button",
        class: value === only ? "on" : "",
        onClick(e) {
          only = value;
          for (const b of seg.children) b.classList.toggle("on", b === e.currentTarget);
          draw();
        },
      }, label),
    ),
  );
  draw();
  fill(
    main,
    pageHead({ title: "操作记录", sub: "最近 100 条，保留 180 天。密钥只记名字。" }),
    entries.length
      ? [
          kinds.length > 1 ? h("div", { class: "row" }, seg) : null,
          h("div", { class: "table-wrap wide" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "时间"), h("th", null, "操作"), h("th", null, "聊天"), h("th", null, "内容"))), tbody)),
        ]
      : h("div", { class: "panel" }, empty("还没有操作。")),
  );
}
