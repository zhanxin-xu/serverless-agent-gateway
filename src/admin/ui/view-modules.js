// The modules (#/modules): what each one gives the bot, whether it's on and why not,
// which provider it uses, and exactly what it adds to the system prompt and the tools.
import { api } from "./api.js";
import { fill, h, pill } from "./dom.js";

/** On, off with the reason, or always on. */
export function moduleState(m) {
  if (m.core) return pill("info", "始终开启");
  return m.ok ? pill("ok", "已开启") : pill("mute", "未开启");
}

/** What the module adds to the model's request, loaded when opened. */
function details(m) {
  const body = h("div", { class: "stack" });
  const el = h("details", { class: "manual" }, h("summary", null, "看它给模型的说明和工具定义"), body);
  let loaded = false;
  el.addEventListener("toggle", async () => {
    if (!el.open || loaded) return;
    loaded = true;
    fill(body, h("p", { class: "muted" }, "加载中…"));
    try {
      const d = await api.get(`modules/${m.id}`);
      // Most modules say the same in a group and in a private chat: show it once then.
      const same = d.sections.length === 2 && d.sections[0].text === d.sections[1].text;
      const sections = (same ? [{ ...d.sections[0], chatType: "both" }] : d.sections).filter((s) => s.text);
      const where = { group: "（群聊）", private: "（私聊）", both: "" };
      fill(
        body,
        sections.length
          ? sections.map((s) => [h("h3", null, `系统提示里的段落${where[s.chatType]}`), h("pre", { class: "sql prompt-text" }, s.text)])
          : h("p", { class: "muted" }, "它不往系统提示里加内容，工具定义自己说明用法。"),
        h("h3", null, `工具定义（${d.definitions.length} 个）`),
        d.definitions.map((t) => h("pre", { class: "sql prompt-text code" }, JSON.stringify(t, null, 2))),
      );
    } catch (err) {
      fill(body, h("p", { class: "field-error" }, err.message));
    }
  });
  return el;
}

function card(m, byId) {
  const cap = m.capability;
  const selected = cap?.providers.find((p) => p.id === cap.selected);
  return h(
    "div",
    { class: "card" },
    h("div", { class: "row between" }, h("h3", null, m.label, " ", moduleState(m)), m.settings ? h("a", { class: "btn btn-small", href: `#/config/${m.settings}` }, "配置") : null),
    h("p", null, m.summary),
    !m.ok && m.reason ? h("p", { class: "help" }, `没开启：${m.reason}`) : null,
    cap
      ? h(
          "p",
          { class: "help" },
          `${cap.label}：`,
          selected ? `${selected.label}${cap.chosen ? "（指定）" : "（自动选择）"}` : "无",
          cap.providers.length > 1 ? ` · 共 ${cap.providers.length} 个实现` : "",
          cap.stateful ? " · 数据存在服务那边，换实现看不到旧数据" : "",
        )
      : null,
    m.requires.length ? h("p", { class: "help" }, `需要：${m.requires.map((id) => byId.get(id)?.label ?? id).join("、")}`) : null,
    h(
      "div",
      { class: "row" },
      m.tools.map((t) => h("code", { class: "copy-value", title: t.offered ? "模型现在能用" : "模型现在用不了" }, t.offered ? t.name : `${t.name}（未提供）`)),
    ),
    m.meter ? h("p", { class: "help" }, `可以给每个聊天设每日额度：${m.meter.label}`) : null,
    details(m),
  );
}

export async function renderModules(main) {
  const modules = await api.get("modules");
  const byId = new Map(modules.map((m) => [m.id, m]));
  fill(
    main,
    h(
      "header",
      { class: "page-head" },
      h("h1", null, "模块"),
      h("p", { class: "muted" }, "机器人的每样本事是一个模块：一组工具，加上告诉模型怎么用它们的一段说明。模块开启时，它的工具和说明才会出现在发给模型的请求里；每个聊天还能在“设置与额度”里单独关掉。"),
    ),
    h("h2", null, "核心"),
    h("div", { class: "module-grid" }, modules.filter((m) => m.core).map((m) => card(m, byId))),
    h("h2", null, "可选"),
    h("div", { class: "module-grid" }, modules.filter((m) => !m.core).map((m) => card(m, byId))),
  );
}
