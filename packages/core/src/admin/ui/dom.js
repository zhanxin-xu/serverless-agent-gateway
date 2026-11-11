// DOM helpers: every element is built with h(), and text always goes in as text,
// never as HTML: chat messages and settings come from people outside.

/** h("div", {class: "x", onClick: fn}, child, "text", [more]) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    // Through the CSSOM: the page's CSP doesn't allow style attributes.
    else if (key === "style") el.style.cssText = value;
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "value" || key === "checked" || key === "disabled" || key === "selected") el[key] = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

/** Replace an element's children. */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export const pill = (kind, text) => h("span", { class: `pill pill-${kind}` }, text);

// ── Page furniture ──

/** A page's top: its title (with pills beside it), a line under it, and what goes on the right. `crumb`: [href, label] back to the list it belongs to. */
export function pageHead({ title, sub, actions, crumb }) {
  return h(
    "header",
    { class: "page-head" },
    h("div", null, crumb ? h("a", { class: "crumb", href: crumb[0] }, "‹ ", crumb[1]) : null, h("h1", null, title), sub ? h("p", { class: "sub" }, sub) : null),
    actions ? h("div", { class: "page-actions" }, actions) : null,
  );
}

/** A titled part of a page; `note` sits at the right of the title. */
export function section(title, note, ...children) {
  return h("section", { class: "section" }, h("div", { class: "section-head" }, h("h2", null, title), note ? h("span", { class: "note" }, note) : null), children);
}

/** Pages within a page: [href, label, mark?] each; the current one is underlined. `mark`: an element after the label. */
export const tabs = (items, current) =>
  h("nav", { class: "tabs" }, items.map(([href, label, mark]) => h("a", { href, class: href === current ? "on" : "", "aria-current": href === current ? "page" : null }, label, mark)));

/** Something to know: "info", "warn" or "bad"; `end` goes at the right (a link, a button). */
export const notice = (kind, text, end) => h("div", { class: `notice notice-${kind}`, role: kind === "bad" ? "alert" : null }, h("span", null, text), end);

export const empty = (text) => h("p", { class: "empty" }, text);

// ── Numbers and times ──

const pad = (n) => String(n).padStart(2, "0");

/** "11/06 15:03" in the viewer's time zone. */
export function fmtTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtClock(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "15:03" */
export const fmtHm = (ms) => fmtClock(ms).slice(0, 5);

/** "今天", "昨天", "11 月 6 日": the day a message was sent, for the line between days. */
export function fmtDay(ms) {
  const d = new Date(ms);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 86_400_000);
  return days === 0 ? "今天" : days === 1 ? "昨天" : `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** "刚刚", "3 分钟前", "2 天前". */
export function fmtAgo(ms) {
  if (!ms) return "—";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

/** "3 分钟前", with the exact time on hover. */
export const ago = (ms) => h("span", { class: "nowrap", title: ms ? new Date(ms).toLocaleString("zh-CN") : null }, fmtAgo(ms));

const num = (n) => Number(n) || 0;
export const fmtUsd = (n) => `$${num(n).toFixed(num(n) < 1 ? 3 : 2)}`;
export const fmtInt = (n) => num(n).toLocaleString("zh-CN");
export const fmtTokens = (n) => (num(n) >= 1_000_000 ? `${(num(n) / 1_000_000).toFixed(2)}M` : num(n) >= 1000 ? `${(num(n) / 1000).toFixed(1)}k` : String(num(n)));

// ── Feedback ──

let toasts;

/** A small transient message at the bottom of the screen. */
export function toast(message, kind = "ok") {
  if (!toasts?.isConnected) document.body.append((toasts = h("div", { class: "toasts" })));
  const el = h("div", { class: `toast toast-${kind}`, role: "status" }, message);
  toasts.append(el);
  setTimeout(() => el.classList.add("toast-out"), kind === "bad" ? 4600 : 2600);
  setTimeout(() => el.replaceWith(), kind === "bad" ? 5000 : 3000);
}

/** Copy text, falling back to selecting it. */
export async function copy(text, el) {
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制");
  } catch {
    if (el) getSelection()?.selectAllChildren(el);
  }
}

/** A value with a copy button. */
export const copyable = (text) => {
  const value = h("code", { class: "copy-value" }, text);
  return h("span", { class: "copyable" }, value, h("button", { type: "button", class: "btn btn-small", onClick: () => copy(text, value) }, "复制"));
};

/** A button that runs `fn`, disabled while it does, and reports failures. */
export function action(label, fn, opts = {}) {
  const btn = h("button", { type: "button", class: `btn${opts.primary ? " btn-primary" : ""}${opts.danger ? " btn-danger" : ""}${opts.small ? " btn-small" : ""}` }, label);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await fn(btn);
    } catch (err) {
      toast(err.message ?? String(err), "bad");
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

/**
 * A button that asks again in place before something hard to undo:
 * the first click shows the question, "确定" runs `fn`.
 */
export function confirmAction(label, question, fn) {
  const wrap = h("span", { class: "confirm" });
  const reset = () => fill(wrap, h("button", { type: "button", class: "btn", onClick: ask }, label));
  function ask() {
    fill(
      wrap,
      h("span", { class: "muted" }, question),
      action("确定", async () => {
        await fn();
        reset();
      }, { danger: true }),
      h("button", { type: "button", class: "btn", onClick: reset }, "取消"),
    );
  }
  reset();
  return wrap;
}

/**
 * A question in a dialog. `choices`: [{ label, value, primary?, danger? }];
 * resolves with the chosen value, or undefined when it's dismissed (Esc).
 */
export function ask({ title, text, choices }) {
  return new Promise((resolve) => {
    const dialog = h(
      "dialog",
      null,
      h(
        "div",
        { class: "ask" },
        h("h2", null, title),
        text ? h("p", null, text) : null,
        h(
          "div",
          { class: "row" },
          choices.map((c) => h("button", { type: "button", class: `btn${c.primary ? " btn-primary" : ""}${c.danger ? " btn-danger" : ""}`, onClick: () => dialog.close(String(c.value)) }, c.label)),
        ),
      ),
    );
    dialog.addEventListener("close", () => {
      dialog.replaceWith();
      resolve(choices.find((c) => String(c.value) === dialog.returnValue)?.value);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** A switch (role="switch"); `onToggle(next)` runs on a click and may be async: the switch is disabled meanwhile. */
export function switchButton({ on, label, title, onToggle }) {
  const btn = h(
    "button",
    {
      type: "button",
      class: `switch${on ? " on" : ""}`,
      role: "switch",
      "aria-checked": String(on),
      "aria-label": label,
      title,
      async onClick(e) {
        e.stopPropagation();
        btn.disabled = true;
        try {
          await onToggle(!on);
        } catch (err) {
          toast(err.message ?? String(err), "bad");
        } finally {
          btn.disabled = false;
        }
      },
    },
    h("span", { class: "knob" }),
  );
  return btn;
}

/** A bar from 0 to 1: amber past 80%, red when full. */
export function meter(ratio) {
  const r = Math.max(0, Math.min(1, ratio));
  return h("div", { class: "meter" }, h("b", { class: r >= 1 ? "full" : r >= 0.8 ? "hot" : "", style: `width:${(r * 100).toFixed(1)}%` }));
}

/** Run `fn` every `ms` while the page is visible; returns a stop function. */
export function every(ms, fn) {
  const id = setInterval(() => {
    if (document.visibilityState === "visible") Promise.resolve(fn()).catch(() => {});
  }, ms);
  return () => clearInterval(id);
}
