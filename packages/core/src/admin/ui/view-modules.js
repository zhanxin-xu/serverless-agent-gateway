// The modules (src/modules): #/modules lists them, #/modules/<id> is one module's page with
// everything about it: its switch, which provider it uses and their settings, its own
// settings, its tools and quota, and exactly what it gives the model.
import { api } from "./api.js";
import { fill, h, notice, pageHead, pill, section, switchButton, toast } from "./dom.js";
import { focusSetting, groupActions, loadSettings, settingsForm } from "./form.js";

/** On, off with the reason, or always on. */
export function moduleState(m) {
  if (m.core) return m.ok ? pill("info", "始终开启") : pill("warn", "未就绪");
  if (m.switch && !m.switch.on) return pill("mute", "已关闭");
  return m.ok ? pill("ok", "已开启") : pill("warn", "未就绪");
}

/** An optional module's switch: turning it off hides it from every chat (MODULE_<ID>). */
const moduleSwitch = (m, onChanged) =>
  switchButton({
    on: m.switch.on,
    label: `${m.label}模块开关`,
    title: m.switch.on ? "关掉后所有聊天都不提供这个模块" : "打开这个模块",
    async onToggle(next) {
      // Clearing the setting means on (its default).
      await api.put("settings", { changes: { [m.switch.setting]: next ? null : "off" } });
      toast(next ? `已打开${m.label}` : `已关闭${m.label}`);
      await onChanged();
    },
  });

// ── The list ──

function moduleRow(m, reload) {
  const cap = m.capability;
  const selected = cap?.providers.find((p) => p.id === cap.selected);
  const off = m.switch && !m.switch.on;
  return h(
    "div",
    { class: "mod" },
    h("div", { class: "mod-name" }, h("a", { href: `#/modules/${m.id}` }, m.label), moduleState(m), cap && selected ? h("span", { class: "faint small" }, `${cap.label}：${selected.label}`) : null),
    h("p", null, m.summary),
    !off && !m.ok && m.reason ? h("p", { class: "why" }, `未就绪：${m.reason}`) : null,
    h("div", { class: "mod-end" }, m.switch ? moduleSwitch(m, reload) : null, h("a", { class: "btn btn-small", href: `#/modules/${m.id}` }, "配置")),
  );
}

async function renderList(main, app) {
  const modules = (await app.refreshStatus()).modules;
  const reload = () => app.go("#/modules");
  const optional = modules.filter((m) => !m.core);
  fill(
    main,
    pageHead({
      title: "模块",
      sub: "机器人的每样本事是一个模块：一组工具，加上告诉模型怎么用它们的一段说明。打开并配好的模块，它的工具和说明才会出现在发给模型的请求里；每个聊天还能在“设置与额度”里单独关掉。",
    }),
    section("核心", "少了它们机器人没法工作", h("div", { class: "panel" }, modules.filter((m) => m.core).map((m) => moduleRow(m, reload)))),
    section("可选", `${optional.filter((m) => m.ok).length} / ${optional.length} 个已开启`, h("div", { class: "panel" }, optional.map((m) => moduleRow(m, reload)))),
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
  return section(
    cap.label,
    cap.providers.length > 1 ? `${cap.providers.length} 个实现可选` : null,
    h(
      "div",
      { class: "panel pad" },
      h(
        "div",
        { class: "set" },
        h(
          "div",
          { class: "set-row" },
          h("div", { class: "about" }, h("label", { for: id }, "实现"), h("p", { class: "help" }, "选了立即切换，不用点保存。", cap.stateful ? "换实现后，原来实现里的数据不会跟过来。" : "")),
          h("div", { class: "ctl" }, select, h("p", { class: "help" }, current.description), !current.available && current.reason ? h("p", { class: "field-error" }, current.reason) : null),
        ),
      ),
      form.el,
      slot,
    ),
  );
}

/** What the module gives the model, loaded when opened. */
function modelView(m) {
  const body = h("div", { class: "stack" });
  const el = h("details", { class: "more" }, h("summary", null, "看它给模型的说明和工具定义"), body);
  let loaded = false;
  el.addEventListener("toggle", async () => {
    if (!el.open || loaded) return;
    loaded = true;
    fill(body, h("p", { class: "faint" }, "加载中…"));
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
          ? sections.map((s) => [h("h3", null, `系统提示里的段落${where[s.chatType]}`), h("pre", { class: "code text" }, s.text)])
          : h("p", { class: "muted" }, "它不往系统提示里加内容，工具定义自己说明用法。"),
        h("h3", null, `工具定义（${d.definitions.length} 个）`),
        d.definitions.map((t) => h("pre", { class: "code wrap" }, JSON.stringify(t, null, 2))),
      );
    } catch (err) {
      loaded = false;
      fill(body, h("p", { class: "field-error" }, err.message));
    }
  });
  return el;
}

async function renderModule(main, id, focus, app) {
  const [status, index] = [await app.refreshStatus(), await loadSettings()];
  const m = status.modules.find((x) => x.id === id);
  if (!m) return fill(main, notice("warn", "没有这个模块。", h("a", { class: "btn btn-small", href: "#/modules" }, "回到模块列表")));
  const byId = new Map(status.modules.map((x) => [x.id, x]));
  const page = `#/modules/${m.id}`;
  const reload = () => app.go(page);

  // The module's own settings, less the switch and the provider choice (they have their own controls).
  const group = m.settings ? index.groups.find((g) => g.id === m.settings) : undefined;
  const ownKeys = group ? index.keysOf(group.id).filter((k) => k !== m.switch?.setting && k !== m.capability?.setting) : [];
  const slot = h("p", { class: "check-result" });
  const own = ownKeys.length ? settingsForm(index, ownKeys, { onSaved: reload, actions: (f) => groupActions(index, group, status, f, slot) }) : null;
  const off = m.switch && !m.switch.on;

  fill(
    main,
    pageHead({
      crumb: ["#/modules", "模块"],
      title: [m.label, moduleState(m)],
      sub: m.summary,
      actions: m.switch ? h("label", { class: "switch-row" }, h("span", null, m.switch.on ? "已打开" : "已关闭"), moduleSwitch(m, reload)) : null,
    }),
    !off && !m.ok && m.reason ? notice("warn", `未就绪：${m.reason}`) : null,
    m.capability ? providers(m, index, status, reload) : null,
    own ? section(m.capability ? "模块设置" : "设置", null, h("div", { class: "panel pad" }, group.help ? h("p", { class: "muted" }, group.help) : null, own.el, slot)) : null,
    section(
      "工具",
      `${m.tools.filter((t) => t.offered).length} / ${m.tools.length} 个模型现在能用`,
      h(
        "div",
        { class: "panel pad" },
        h("div", { class: "tools" }, m.tools.map((t) => h("code", { class: `tag${t.offered ? "" : " off"}`, title: t.offered ? "模型现在能用" : "模型现在用不了" }, t.name))),
        m.requires.length ? h("p", { class: "help" }, `需要：${m.requires.map((r) => byId.get(r)?.label ?? r).join("、")}`) : null,
        m.meter ? h("p", { class: "help" }, `每个聊天可以在“设置与额度”里设每日额度：${m.meter.label}`) : null,
        modelView(m),
      ),
    ),
  );

  if (focus) {
    // Once the page is on screen: bring the setting the address names into view, then drop it from the address.
    setTimeout(() => {
      if (!focusSetting(focus)) {
        const from = index.groups.find((g) => g.id === index.defs.get(focus)?.group);
        if (from?.provider) toast(`这一项属于“${from.label}”，先在“实现”里切换到它`);
      }
      app.settle(page);
    }, 0);
  }
}

export async function renderModules(main, [id, focus], app) {
  return id ? renderModule(main, id, focus, app) : renderList(main, app);
}
