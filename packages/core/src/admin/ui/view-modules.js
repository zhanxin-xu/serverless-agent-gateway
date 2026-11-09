// The modules (src/modules): #/modules lists them, #/modules/<id> is one module's page with
// everything about it: its switch, which provider it uses and their settings, its own
// settings, its tools and quota, and exactly what it gives the model.
import { api } from "./api.js";
import { fill, h, pill, toast } from "./dom.js";
import { groupActions, loadSettings, settingsForm } from "./form.js";
import { icon } from "./icons.js";

/** On, off with the reason, or always on. */
export function moduleState(m) {
  if (m.core) return m.ok ? pill("info", "始终开启") : pill("warn", "未就绪");
  if (m.switch && !m.switch.on) return pill("mute", "已关闭");
  return m.ok ? pill("ok", "已开启") : pill("warn", "未就绪");
}

/** An optional module's switch: turning it off hides it from every chat (MODULE_<ID>). */
function moduleSwitch(m, onChanged) {
  const on = m.switch.on;
  const btn = h(
    "button",
    {
      type: "button",
      class: `switch${on ? " on" : ""}`,
      role: "switch",
      "aria-checked": String(on),
      "aria-label": `${m.label}模块开关`,
      title: on ? "关掉后所有聊天都不提供这个模块" : "打开这个模块",
      async onClick(e) {
        e.stopPropagation();
        btn.disabled = true;
        try {
          // Clearing the setting means on (its default).
          await api.put("settings", { changes: { [m.switch.setting]: on ? "off" : null } });
          toast(on ? `已关闭${m.label}` : `已打开${m.label}`);
          await onChanged();
        } catch (err) {
          toast(err.message, "bad");
          btn.disabled = false;
        }
      },
    },
    h("span", { class: "knob" }),
  );
  return h("span", { class: "switch-row" }, btn, h("span", { class: "small muted" }, on ? "开" : "关"));
}

// ── The list ──

function card(m) {
  const cap = m.capability;
  const selected = cap?.providers.find((p) => p.id === cap.selected);
  return h(
    "div",
    { class: "card" },
    h("div", { class: "row between" }, h("h3", null, m.label, " ", moduleState(m)), h("a", { class: "btn btn-small", href: `#/modules/${m.id}` }, "配置")),
    h("p", null, m.summary),
    m.switch?.on && !m.ok && m.reason ? h("p", { class: "help" }, `未就绪：${m.reason}`) : null,
    cap && selected ? h("p", { class: "help" }, `${cap.label}：${selected.label}`) : null,
  );
}

async function renderList(main, app) {
  const modules = (await app.refreshStatus()).modules;
  fill(
    main,
    h(
      "header",
      { class: "page-head" },
      h("h1", null, "模块"),
      h("p", { class: "muted" }, "机器人的每样本事是一个模块：一组工具，加上告诉模型怎么用它们的一段说明。打开并配好的模块，它的工具和说明才会出现在发给模型的请求里；每个聊天还能在“设置与额度”里单独关掉。"),
    ),
    h("h2", null, "核心"),
    h("div", { class: "module-grid" }, modules.filter((m) => m.core).map(card)),
    h("h2", null, "可选"),
    h("div", { class: "module-grid" }, modules.filter((m) => !m.core).map(card)),
  );
}

// ── One module ──

/** Which provider the module uses: one choice, and that provider's settings below it. */
function providers(m, index, status, reload) {
  const cap = m.capability;
  // The provider in use; before any is configured, the one chosen, else the first, to fill in.
  const current = cap.providers.find((p) => p.id === cap.selected) ?? cap.providers.find((p) => p.id === cap.chosen) ?? cap.providers[0];
  const id = `provider-${m.id}`;
  const select = h(
    "select",
    {
      id,
      async onChange(e) {
        select.disabled = true;
        try {
          await api.put("settings", { changes: { [cap.setting]: e.target.value } });
          toast("已切换");
          await reload();
        } catch (err) {
          toast(err.message, "bad");
          select.disabled = false;
        }
      },
    },
    cap.providers.map((p) => h("option", { value: p.id, selected: p === current }, p.label)),
  );
  const group = index.groups.find((g) => g.id === current.settings);
  const slot = h("p", { class: "check-result" });
  const form = settingsForm(index, index.keysOf(current.settings), { onSaved: reload, actions: (f) => groupActions(index, group, status, f, slot) });
  return h(
    "section",
    { class: "stack" },
    h("h2", null, cap.label),
    h(
      "div",
      { class: "field" },
      h("label", { for: id }, "实现"),
      select,
      h("p", { class: "help" }, current.description, cap.stateful ? " 换实现后，原来实现里的数据不会跟过来。" : ""),
      !current.available && current.reason ? h("p", { class: "field-error" }, current.reason) : null,
    ),
    form.el,
    slot,
  );
}

/** What the module gives the model, loaded when opened. */
function modelView(m) {
  const body = h("div", { class: "stack" });
  const el = h("details", { class: "manual" }, h("summary", null, "看它给模型的说明和工具定义"), body);
  let loaded = false;
  el.addEventListener("toggle", async () => {
    if (!el.open || loaded) return;
    loaded = true;
    fill(body, h("p", { class: "muted" }, "加载中…"));
    try {
      const d = await api.get(`modules/${m.id}`);
      if (!d.ok) return fill(body, h("p", { class: "muted" }, "模块没开启，模型看不到它。"));
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

async function renderModule(main, id, app) {
  const [status, index] = [await app.refreshStatus(), await loadSettings()];
  const m = status.modules.find((x) => x.id === id);
  if (!m) return fill(main, h("p", null, "没有这个模块。", h("a", { href: "#/modules" }, "回到模块列表")));
  const byId = new Map(status.modules.map((x) => [x.id, x]));
  const reload = () => app.go(`#/modules/${m.id}`);

  // The module's own settings, less the switch and the provider choice (they have their own controls).
  const group = m.settings ? index.groups.find((g) => g.id === m.settings) : undefined;
  const ownKeys = group ? index.keysOf(group.id).filter((k) => k !== m.switch?.setting && k !== m.capability?.setting) : [];
  const slot = h("p", { class: "check-result" });
  const own = ownKeys.length ? settingsForm(index, ownKeys, { onSaved: reload, actions: (f) => groupActions(index, group, status, f, slot) }) : null;

  fill(
    main,
    h(
      "header",
      { class: "page-head" },
      h("p", null, h("a", { href: "#/modules" }, icon("back", 14), "模块")),
      h("div", { class: "row between" }, h("h1", null, m.label, " ", moduleState(m)), m.switch ? moduleSwitch(m, reload) : null),
      h("p", { class: "muted" }, m.summary),
      m.switch?.on && !m.ok && m.reason ? h("p", { class: "help" }, `未就绪：${m.reason}`) : null,
    ),
    m.capability ? providers(m, index, status, reload) : null,
    own
      ? h("section", { class: "stack" }, h("h2", null, m.capability ? "模块设置" : "设置"), group.help ? h("p", { class: "muted" }, group.help) : null, own.el, slot)
      : null,
    h(
      "section",
      { class: "stack" },
      h("h2", null, "工具"),
      h(
        "div",
        { class: "row" },
        m.tools.map((t) => h("code", { class: "copy-value", title: t.offered ? "模型现在能用" : "模型现在用不了" }, t.offered ? t.name : `${t.name}（未提供）`)),
      ),
      m.requires.length ? h("p", { class: "help" }, `需要：${m.requires.map((r) => byId.get(r)?.label ?? r).join("、")}`) : null,
      m.meter ? h("p", { class: "help" }, `每个聊天可以在“设置与额度”里设每日额度：${m.meter.label}`) : null,
      modelView(m),
    ),
  );
}

export async function renderModules(main, [id], app) {
  return id ? renderModule(main, id, app) : renderList(main, app);
}
