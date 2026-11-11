// The console's shell: sign-in, navigation, and a hash router that mounts one view at a time.
//   #/setup  #/overview  #/chats  #/chat/<chat>/<tab>  #/modules  #/modules/<id>  #/config/<group>  #/log
// A setting's key after a module or a config group (#/config/agent/AGENT_MAX_STEPS) brings that setting into view.
import { api } from "./api.js";
import { ask, fill, h, notice, toast } from "./dom.js";
import { pending } from "./form.js";
import { icon } from "./icons.js";
import { openPalette } from "./palette.js";
import { renderChat } from "./view-chat.js";
import { renderChats } from "./view-chats.js";
import { renderConfig } from "./view-config.js";
import { renderLog } from "./view-log.js";
import { renderModules } from "./view-modules.js";
import { renderOverview } from "./view-overview.js";
import { renderSetup, setupProgress } from "./view-setup.js";

const root = document.getElementById("app");

// ── Appearance: the system's, unless the viewer pinned one (kept in this browser) ──

const THEME_KEY = "admin.theme";
const THEMES = { auto: "跟随系统", light: "浅色", dark: "深色" };
const stored = () => {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
};
let theme = stored() in THEMES ? stored() : "auto";
const applyTheme = () => {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
};
applyTheme();

/** Shared by the views: the setup status, refreshed after changes. */
const app = {
  status: null,
  /** The composed persona's name (GET session). */
  botName: "机器人",
  async refreshStatus() {
    app.status = await api.get("status");
    renderNav();
    return app.status;
  },
  /** Go to a page; the same one draws again in place. */
  go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  },
  /** The page on screen now goes by this address (a view drops the part that only said where to scroll); nothing is drawn again. */
  settle(hash) {
    if (location.hash === hash) return;
    history.replaceState(null, "", hash);
    shown = hash;
  },
};

const VIEWS = {
  setup: renderSetup,
  overview: renderOverview,
  chats: renderChats,
  chat: renderChat,
  modules: renderModules,
  config: renderConfig,
  log: renderLog,
};

let nav;
let main;
let stopView;
/** The page on screen; `routing` counts navigations, so a slow one that was overtaken is dropped. */
let shown = "";
let routing = 0;

function navLink(hash, iconName, label, count) {
  const active = location.hash.startsWith(hash) || (hash === "#/chats" && location.hash.startsWith("#/chat/"));
  return h("a", { href: hash, class: `item${active ? " on" : ""}`, "aria-current": active ? "page" : null }, icon(iconName), h("span", null, label), count ? h("span", { class: "count due" }, count) : null);
}

function renderNav() {
  if (!nav || !app.status) return;
  const progress = setupProgress(app.status);
  const guided = progress.done >= progress.total;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  fill(
    nav,
    h("a", { class: "brand", href: "#/overview" }, h("img", { src: "/admin/logo.webp", alt: "", width: 26, height: 26, onError: (e) => e.target.replaceWith() }), h("span", null, app.botName, " ", h("small", null, "管理端"))),
    h(
      "nav",
      { class: "side-nav", "aria-label": "主导航" },
      guided ? null : navLink("#/setup", "setup", "新手引导", `${progress.done}/${progress.total}`),
      navLink("#/overview", "overview", "总览"),
      navLink("#/chats", "chats", "聊天"),
      navLink("#/modules", "modules", "模块"),
      navLink("#/config", "config", "配置"),
      navLink("#/log", "log", "操作记录"),
      guided ? navLink("#/setup", "setup", "引导与检查") : null,
    ),
    h(
      "div",
      { class: "side-foot" },
      h("button", { type: "button", class: "item", title: "找聊天、模块、任何一项设置", onClick: () => openPalette(app) }, icon("search"), h("span", null, "跳转"), h("span", { class: "kbd" }, mac ? "⌘K" : "Ctrl K")),
      h(
        "button",
        {
          type: "button",
          class: "item",
          title: "切换外观：跟随系统、浅色、深色",
          onClick() {
            const order = Object.keys(THEMES);
            theme = order[(order.indexOf(theme) + 1) % order.length];
            try {
              if (theme === "auto") localStorage.removeItem(THEME_KEY);
              else localStorage.setItem(THEME_KEY, theme);
            } catch {}
            applyTheme();
            renderNav();
          },
        },
        icon(theme),
        h("span", null, `外观：${THEMES[theme]}`),
      ),
      h(
        "button",
        {
          type: "button",
          class: "item",
          async onClick() {
            await api.del("session");
            pending.clear();
            start();
          },
        },
        icon("logout"),
        h("span", null, "退出登录"),
      ),
    ),
  );
}

/**
 * Mount the view the address names. The page on screen stays (dimmed) until the
 * new one has loaded, then they swap: no blank flash between pages, and a page
 * that draws itself again (after a save) keeps its scroll position.
 */
async function route() {
  if (!main) return;
  const turn = ++routing;
  const hash = location.hash;
  const [name = "", ...args] = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const view = VIEWS[name];
  if (!view) {
    const progress = setupProgress(app.status);
    location.replace(progress.required ? "#/setup" : "#/overview");
    return;
  }
  stopView?.();
  stopView = undefined;
  pending.clear();
  renderNav();
  const again = hash === shown;
  const scroll = again ? { page: scrollY, inner: main.querySelector("[data-scroll]")?.scrollTop } : null;
  main.classList.add("busy");
  // Each view draws into a fresh <main>: it may give the page its own layout (the chat view fills the screen).
  const next = h("main", { class: "main", tabindex: "-1" });
  let stop;
  try {
    stop = await view(next, args, app);
  } catch (err) {
    fill(next, notice("bad", `加载失败：${err.message}`, h("button", { type: "button", class: "btn btn-small", onClick: route }, "重试")));
  }
  if (turn !== routing) {
    // Another navigation started while this one loaded.
    if (typeof stop === "function") stop();
    return;
  }
  main.replaceWith(next);
  main = next;
  shown = hash;
  stopView = typeof stop === "function" ? stop : undefined;
  if (scroll) {
    scrollTo(0, scroll.page);
    const inner = main.querySelector("[data-scroll]");
    if (inner && scroll.inner) inner.scrollTop = scroll.inner;
  } else {
    scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
}

/** A step back in history that isn't a navigation (the viewer chose to stay). */
let stayed = false;

/** Leaving a page with unsaved changes asks first. */
async function onHashChange() {
  if (stayed) {
    stayed = false;
    return;
  }
  const count = main && location.hash !== shown ? pending.count() : 0;
  if (count) {
    const stay = () => {
      stayed = true;
      history.back();
    };
    const choice = await ask({
      title: `还有 ${count} 项改动没保存`,
      text: "离开这个页面，没保存的改动就没了。",
      choices: [
        { label: "留在这里", value: "stay" },
        { label: "放弃改动", value: "drop" },
        { label: "保存并离开", value: "save", primary: true },
      ],
    });
    if (choice !== "save" && choice !== "drop") return stay();
    if (choice === "save") {
      try {
        await pending.saveAll();
      } catch (err) {
        toast(err.message ?? String(err), "bad");
        return stay();
      }
    }
  }
  route();
}

function renderShell() {
  nav = h("aside", { class: "side" });
  main = h("main", { class: "main", tabindex: "-1" }, h("p", { class: "boot" }, "加载中…"));
  shown = "";
  fill(root, h("div", { class: "shell" }, nav, main));
  renderNav();
  route();
}

// The steps come from the deployment (src/composition.ts, ConsoleGuide): they depend on where it runs.
function renderNoPassword(steps) {
  fill(
    root,
    h(
      "div",
      { class: "gate" },
      gateLogo(),
      h("h1", null, "先设一个管理密码"),
      h("p", { class: "muted" }, "管理端用环境变量 ADMIN_PASSWORD 保护，这是唯一需要在部署环境里手动设置的变量："),
      h("ol", null, steps.map((s) => h("li", null, s))),
      h("p", { class: "faint small" }, "其余配置都能在这个页面里填，改了不用重新部署。"),
    ),
  );
}

const gateLogo = () => h("img", { class: "gate-logo", src: "/admin/logo.webp", alt: "", width: 52, height: 52, onError: (e) => e.target.replaceWith() });

function renderLogin() {
  const input = h("input", { id: "password", type: "password", autocomplete: "current-password", required: true });
  const error = h("p", { class: "field-error", role: "alert", hidden: true });
  const submit = h("button", { type: "submit", class: "btn btn-primary" }, "登录");
  const form = h(
    "form",
    {
      class: "gate",
      async onSubmit(e) {
        e.preventDefault();
        submit.disabled = true;
        submit.textContent = "登录中…";
        error.hidden = true;
        try {
          await api.post("session", { password: input.value });
          await start();
        } catch (err) {
          error.hidden = false;
          error.textContent = err.message;
          submit.disabled = false;
          submit.textContent = "登录";
          input.select();
        }
      },
    },
    gateLogo(),
    h("h1", null, `${app.botName}管理端`),
    h("div", { class: "field" }, h("label", { for: "password" }, "管理密码"), input, error),
    submit,
  );
  fill(root, form);
  input.focus();
}

async function start() {
  nav = main = undefined;
  stopView?.();
  stopView = undefined;
  const session = await api.get("session");
  app.botName = session.botName;
  document.title = `${app.botName}管理端`;
  if (!session.passwordSet) return renderNoPassword(session.howToSetPassword);
  if (!session.loggedIn) return renderLogin();
  await app.refreshStatus();
  renderShell();
}

window.addEventListener("hashchange", onHashChange);
window.addEventListener("beforeunload", (e) => pending.count() && e.preventDefault());
window.addEventListener("keydown", (e) => {
  if (!main || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
  const key = e.key.toLowerCase();
  if (key === "k") {
    e.preventDefault();
    openPalette(app);
  } else if (key === "s" && pending.count()) {
    // ⌘S saves the form being edited.
    e.preventDefault();
    pending.saveFirst();
  }
});
window.addEventListener("admin:signed-out", () => {
  toast("登录已过期，请重新登录", "bad");
  pending.clear();
  start();
});
start().catch((err) => fill(root, h("div", { class: "gate" }, h("h1", null, "打不开管理端"), h("p", { class: "muted" }, err.message), h("button", { type: "button", class: "btn", onClick: () => location.reload() }, "重试"))));
