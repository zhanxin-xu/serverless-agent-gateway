// Jump to anything (⌘K): pages, chats, modules, and every setting by its label or key.
// There are a lot of settings, spread over the modules' pages and the config groups;
// typing a few letters of one is quicker than remembering where it lives.
import { api } from "./api.js";
import { fill, h } from "./dom.js";
import { loadSettings } from "./form.js";
import { chatKind, chatName, speakersText } from "./labels.js";

const PAGES = [
  ["总览", "#/overview", "花费、额度、最近的问题"],
  ["聊天", "#/chats", "所有聊天"],
  ["模块", "#/modules", "她的每样本事"],
  ["配置", "#/config", "渠道、Agent 参数、计价、管理端"],
  ["操作记录", "#/log", "谁改了什么"],
  ["引导与检查", "#/setup", "从建表到第一条消息"],
];

/** Everything that can be jumped to: { title, sub, kind, href, text (what's searched) }. */
async function collect(app) {
  const items = PAGES.map(([title, href, sub]) => ({ title, sub, kind: "页面", href }));
  const modules = app.status?.modules ?? [];
  for (const m of modules) items.push({ title: m.label, sub: m.summary, kind: "模块", href: `#/modules/${m.id}` });
  const [chats, index] = await Promise.all([api.get("chats").catch(() => []), loadSettings().catch(() => null)]);
  for (const c of chats) {
    items.push({ title: chatName(c), sub: [chatKind(c), speakersText(c), c.chat].filter(Boolean).join(" · "), kind: "聊天", href: `#/chat/${encodeURIComponent(c.chat)}/history` });
  }
  if (index) {
    const groups = new Map(index.groups.map((g) => [g.id, g]));
    for (const def of index.defs.values()) {
      const group = groups.get(def.group);
      if (!group) continue;
      const module = group.module ? modules.find((m) => m.id === group.module) : undefined;
      const where = module ? (group.provider ? `${module.label} · ${group.label}` : module.label) : group.label;
      items.push({
        title: def.label,
        sub: `${where} · ${def.key}`,
        kind: "设置",
        href: module ? `#/modules/${module.id}/${def.key}` : `#/config/${group.id}/${def.key}`,
      });
    }
  }
  for (const item of items) item.text = `${item.title} ${item.sub} ${item.kind}`.toLowerCase();
  return items;
}

let open = false;

export async function openPalette(app) {
  if (open) return;
  open = true;
  let items = [];
  let shown = [];
  let at = 0;
  const list = h("ul", { role: "listbox" });
  const input = h("input", { type: "search", placeholder: "找聊天、模块或设置：名字、ID、变量名…", "aria-label": "跳转", autocomplete: "off", spellcheck: "false" });
  const dialog = h("dialog", { class: "palette" }, input, list);
  const go = (item) => {
    dialog.close();
    if (item) app.go(item.href);
  };
  const draw = () => {
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    // Nothing typed: the pages and the chats, which is what people come for most; settings show up once there's a word.
    shown = (words.length ? items.filter((i) => words.every((w) => i.text.includes(w))) : items.filter((i) => i.kind !== "设置")).slice(0, 40);
    at = Math.min(at, Math.max(0, shown.length - 1));
    fill(
      list,
      shown.length
        ? shown.map((item, i) =>
            h("li", { role: "option", class: i === at ? "on" : "", "aria-selected": String(i === at), onClick: () => go(item), onMousemove: () => i !== at && ((at = i), mark()) }, h("b", null, item.title), h("span", null, item.sub), h("em", null, item.kind)),
          )
        : h("li", { class: "empty" }, items.length ? "没找到" : "加载中…"),
    );
  };
  const mark = () => [...list.children].forEach((li, i) => (li.classList.toggle("on", i === at), li.setAttribute("aria-selected", String(i === at))));
  input.addEventListener("input", () => ((at = 0), draw()));
  input.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!shown.length) return;
      at = (at + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length;
      mark();
      list.children[at]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(shown[at]);
    }
  });
  // A click on the backdrop closes it (the dialog element itself is the only thing outside its content).
  dialog.addEventListener("click", (e) => e.target === dialog && dialog.close());
  dialog.addEventListener("close", () => {
    dialog.replaceWith();
    open = false;
  });
  document.body.append(dialog);
  dialog.showModal();
  draw();
  items = await collect(app);
  draw();
}
