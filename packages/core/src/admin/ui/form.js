// Settings forms, built from the catalog the server sends (src/settings/catalog.ts):
// one row per setting (what it is on the left, the control on the right, where its
// value comes from under it), and a bar that says what's unsaved and sends only that.
import { api, ApiError } from "./api.js";
import { action, copyable, fill, fmtTime, h, pill, toast } from "./dom.js";

/** Where a value comes from: [dot color, text]. */
const SOURCES = {
  db: ["ok", "在管理端设的"],
  env: ["warn", "来自环境变量"],
  default: ["", "默认值"],
};

// ── Unsaved work ──
// Every form on the page registers here, so the shell can ask before leaving it (app.js)
// and ⌘S can save it. A view that mounts starts with none (pending.clear()).

const forms = new Set();

export const pending = {
  count: () => [...forms].reduce((n, f) => n + f.count(), 0),
  /** Save every form with changes; nothing is re-rendered (the caller is leaving the page). */
  saveAll: async () => {
    for (const f of forms) if (f.count()) await f.save({ silent: true });
  },
  /** ⌘S: the first form with changes saves as if its button was clicked. */
  saveFirst: () => [...forms].find((f) => f.count())?.click(),
  clear: () => forms.clear(),
  /** A form that isn't a settings form (a chat's profile) takes part with { count, save, click }. */
  add: (form) => forms.add(form),
};

/** GET settings, indexed by key. */
export async function loadSettings() {
  const data = await api.get("settings");
  return {
    groups: data.groups,
    defs: new Map(data.settings.map((d) => [d.key, d])),
    values: new Map(data.values.map((v) => [v.key, v])),
    keysOf: (group) => data.settings.filter((d) => d.group === group).map((d) => d.key),
  };
}

/**
 * Each editor: { el, value(), reset(), focus() }. value() is what to send:
 * undefined = unchanged, null = clear, a string = the new value.
 */

/** A secret: shows the masked value; "替换" opens an input, "清除" removes the one stored here. */
function secretEditor(def, view, id, changed) {
  const input = h("input", { id, type: "password", autocomplete: "off", spellcheck: "false", placeholder: `新的 ${def.label}`, onInput: changed });
  const box = h("div", { class: "secret" });
  let initial = view.value ? "keep" : "edit";
  let mode = initial;
  const set = (next) => {
    mode = next;
    render();
    changed();
  };
  const render = () => {
    if (mode === "edit") {
      return fill(box, input, view.value ? h("button", { type: "button", class: "btn btn-small", onClick: () => ((input.value = ""), set("keep")) }, "不换了") : null);
    }
    if (mode === "clear") return fill(box, h("span", { class: "muted" }, "保存后清除"), h("button", { type: "button", class: "btn btn-small", onClick: () => set("keep") }, "撤销"));
    return fill(
      box,
      h("code", { class: "secret-value" }, view.value),
      h("button", { type: "button", class: "btn btn-small", onClick: () => (set("edit"), input.focus()) }, "替换"),
      view.source === "db" ? h("button", { type: "button", class: "btn btn-small", onClick: () => set("clear") }, "清除") : null,
    );
  };
  render();
  return {
    el: box,
    value: () => (mode === "clear" ? null : mode === "edit" && input.value.trim() ? input.value.trim() : undefined),
    reset() {
      input.value = "";
      mode = initial;
      render();
    },
    /** What was typed is now what's stored (the page isn't reloaded after every save). */
    commit() {
      view = mode === "clear" ? { ...view, value: "", source: "default" } : { ...view, value: "••••（刚保存）", source: "db" };
      input.value = "";
      mode = initial = view.value ? "keep" : "edit";
      render();
    },
  };
}

function plainEditor(def, view, id, changed, showError) {
  let initial = view.value ?? "";
  let el;
  let extra = null;
  if (def.kind === "enum") {
    el = h("select", { id, onChange: changed }, def.options.map((o) => h("option", { value: o.value, selected: o.value === initial }, o.label)));
  } else if (def.kind === "json" || def.kind === "textarea") {
    const json = def.kind === "json";
    el = h("textarea", { id, spellcheck: "false", class: json ? "mono" : "", onInput: changed });
    el.value = initial;
    // As tall as what's in it, within reason.
    const fit = () => (el.rows = Math.min(14, Math.max(json ? 2 : 3, el.value.split("\n").length)));
    el.addEventListener("input", fit);
    fit();
    if (json) {
      // Caught here before the server says so: a slip in the JSON is the usual mistake.
      const parsed = () => (el.value.trim() ? JSON.parse(el.value) : undefined);
      el.addEventListener("blur", () => {
        try {
          parsed();
          showError(null);
        } catch (err) {
          showError(`不是合法的 JSON：${err.message}`);
        }
      });
      extra = h("button", {
        type: "button",
        class: "link small",
        onClick() {
          try {
            const value = parsed();
            if (value === undefined) return;
            el.value = JSON.stringify(value, null, 2);
            showError(null);
            fit();
            changed();
          } catch (err) {
            showError(`不是合法的 JSON：${err.message}`);
          }
        },
      }, "整理格式");
    }
  } else {
    const numeric = def.kind === "int" || def.kind === "number";
    el = h("input", { id, type: "text", value: initial, spellcheck: "false", inputmode: numeric ? "decimal" : null, class: def.kind === "url" ? "mono" : "", onInput: changed });
  }
  return {
    el,
    extra,
    value() {
      const now = el.value.trim();
      if (now === initial.trim()) return undefined;
      return now === "" ? null : now;
    },
    reset: () => (el.value = initial),
    /** After a save that cleared the value, the field shows what applies now: the default. */
    commit(cleared) {
      if (cleared) el.value = def.default ?? "";
      initial = el.value;
    },
  };
}

/** One setting: label, help and key on the left; the editor, where the value comes from, and an error slot on the right. */
function settingField(def, view, changed) {
  const id = `setting-${def.key}`;
  const error = h("p", { class: "field-error", hidden: true });
  const showError = (message) => {
    error.hidden = !message;
    error.textContent = message ?? "";
  };
  // "恢复默认": a value set here goes back to the environment's or the default (secrets have their own "清除").
  let clearing = false;
  const mark = () => {
    row.classList.toggle("changed", field.value() !== undefined);
    changed();
  };
  const editor = def.kind === "secret" ? secretEditor(def, view, id, () => mark()) : plainEditor(def, view, id, () => mark(), showError);
  let source = view.source;
  let updatedAt = view.updatedAt;
  const from = h("p", { class: "from" });
  const drawFrom = () => {
    if (clearing) {
      return fill(from, h("span", null, "保存后恢复成环境变量里的值或默认值"), h("button", { type: "button", class: "link", onClick: () => ((clearing = false), drawFrom(), mark()) }, "撤销"));
    }
    const [dot, text] = SOURCES[source];
    fill(
      from,
      h("span", { class: `dot ${dot}` }),
      h("span", null, text, source === "db" && updatedAt ? ` · ${fmtTime(updatedAt)}` : ""),
      editor.extra,
      source === "db" && def.kind !== "secret" ? h("button", { type: "button", class: "link", onClick: () => ((clearing = true), drawFrom(), mark()) }, "恢复默认") : null,
    );
  };
  const ctl = h("div", { class: "ctl" }, editor.el, from, error);
  const row = h(
    "div",
    { class: "set-row", id: `row-${def.key}` },
    h("div", { class: "about" }, h("label", { for: id }, def.label), def.help ? h("p", { class: "help" }, def.help) : null, h("p", { class: "key" }, def.key)),
    ctl,
  );
  const field = {
    key: def.key,
    el: row,
    value: () => (clearing ? null : editor.value()),
    reset() {
      clearing = false;
      editor.reset();
      showError(null);
      drawFrom();
      row.classList.remove("changed");
    },
    /** `value` was saved: it's the stored value now. */
    commit(value) {
      editor.commit(value === null);
      clearing = false;
      source = value === null ? "default" : "db";
      updatedAt = Date.now();
      drawFrom();
      row.classList.remove("changed");
    },
    showError,
  };
  drawFrom();
  return field;
}

/**
 * A form for some settings. Its bar says how many are changed; "保存" sends only
 * those. `actions(form)` returns what goes beside the button (checks that save
 * the form first); `onSaved` runs after a save (not when the shell saves on the
 * way out of the page).
 */
export function settingsForm(index, keys, { onSaved, actions, saveLabel = "保存" } = {}) {
  const state = h("span", { class: "state" });
  const bar = h("div", { class: "savebar" });
  const count = () => fields.filter((f) => f.value() !== undefined).length;
  const refresh = () => {
    const n = count();
    bar.classList.toggle("dirty", n > 0);
    fill(state, n ? [`${n} 项改动没保存 `, h("button", { type: "button", class: "link", onClick: discard }, "撤销")] : "");
  };
  const fields = keys.filter((k) => index.defs.has(k)).map((k) => settingField(index.defs.get(k), index.values.get(k), () => refresh()));
  const discard = () => {
    for (const f of fields) f.reset();
    refresh();
  };
  const save = async ({ silent } = {}) => {
    const changes = {};
    for (const f of fields) {
      f.showError(null);
      const value = f.value();
      if (value !== undefined) changes[f.key] = value;
    }
    if (!Object.keys(changes).length) return false;
    try {
      await api.put("settings", { changes });
    } catch (err) {
      if (err instanceof ApiError) {
        const bad = fields.filter((f) => err.fields[f.key]);
        for (const f of bad) f.showError(err.fields[f.key]);
        bad[0]?.el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      throw err;
    }
    // Saved: what was typed is the stored value now, whether or not the page is drawn again.
    for (const f of fields) if (f.key in changes) f.commit(changes[f.key]);
    refresh();
    toast("已保存，30 秒内生效");
    if (!silent) await onSaved?.();
    return true;
  };
  const saveButton = action(saveLabel, async () => (await save()) || toast("没有改动"), { primary: true });
  const el = h(
    "form",
    {
      class: "set",
      onSubmit: (e) => e.preventDefault(),
      // Enter in a one-line field saves, as a form would.
      onKeydown: (e) => e.key === "Enter" && e.target.tagName === "INPUT" && !e.isComposing && (e.preventDefault(), saveButton.click()),
    },
    fields.map((f) => f.el),
    bar,
  );
  const form = { el, save };
  fill(bar, saveButton, [actions?.(form)].flat().filter(Boolean), h("span", { class: "spacer" }), state);
  forms.add({ count, save, click: () => saveButton.click() });
  refresh();
  return form;
}

/** Bring one setting into view and flash it (the jump box lands here). False when it isn't on the page. */
export function focusSetting(key) {
  const row = document.getElementById(`row-${key}`);
  if (!row) return false;
  row.scrollIntoView({ block: "center" });
  row.classList.add("flash");
  row.querySelector("input, select, textarea, button")?.focus({ preventScroll: true });
  return true;
}

/** A check's result line ({ok, message, ms}). */
export function checkResult(slot, result) {
  fill(slot, pill(result.ok ? "ok" : "bad", result.ok ? "通过" : "失败"), " ", result.message, result.ms ? h("span", { class: "faint" }, ` · ${(result.ms / 1000).toFixed(1)} 秒`) : null);
}

/** A button that runs a check (POST path) and shows its result next to it. */
function checkButton(label, path, before) {
  const slot = h("span", { class: "check-result" });
  const btn = action(label, async () => {
    fill(slot, h("span", { class: "faint" }, "检查中…"));
    try {
      if (before) await before();
      checkResult(slot, await api.post(path));
    } catch (err) {
      fill(slot);
      throw err;
    }
  });
  return h("span", { class: "check-btn" }, btn, slot);
}

/**
 * A module's check (src/modules: Module.check), on the group whose settings it
 * tests: a module without providers on its own group, else on the provider in
 * use (or the only one there is).
 */
function moduleCheck(group, status) {
  const module = group.module ? status.modules?.find((m) => m.id === group.module) : undefined;
  if (!module?.canCheck) return undefined;
  const cap = module.capability;
  if (!cap) return group.provider ? undefined : `checks/module/${module.id}`;
  if (!group.provider) return undefined;
  const inUse = cap.selected === group.provider.id || cap.providers.length === 1;
  return inUse ? `checks/module/${module.id}` : undefined;
}

/**
 * What goes beside a group's save button: its check, its channel's verify and
 * connect (which save the form first, so they use what was typed), and
 * "生成" for each secret the console can make up (shown once, in `slot`; none without one).
 */
export function groupActions(index, group, status, form, slot) {
  const items = [];
  const saveFirst = () => form.save({ silent: true });
  const check = moduleCheck(group, status);
  if (check) items.push(checkButton("保存并检查", check, saveFirst));
  const channel = group.channel ? status.channels.find((c) => c.name === group.channel) : undefined;
  if (channel?.canVerify) items.push(checkButton("保存并检查", `channels/${channel.name}/verify`, saveFirst));
  if (channel?.canConnect) items.push(checkButton("保存并设置 Webhook", `channels/${channel.name}/connect`, saveFirst));
  if (!slot) return items;
  for (const key of index.keysOf(group.id).filter((k) => index.defs.get(k).generate)) {
    const { label } = index.defs.get(key);
    items.push(
      action(`生成 ${label}`, async () => {
        const { value } = await api.post("settings/generate", { key });
        fill(slot, `新的 ${label}（只显示这一次）：`, copyable(value));
      }),
    );
  }
  return items;
}
