// The console's shell: sign-in, navigation, and a hash router that mounts one view at a time.
//   #/setup  #/overview  #/chats  #/chat/<chat>/<tab>  #/modules  #/modules/<id>  #/config/<group>  #/log
import { api } from "./api.js";
import { action, fill, h, toast } from "./dom.js";
import { icon } from "./icons.js";
import { renderChat } from "./view-chat.js";
import { renderChats } from "./view-chats.js";
import { renderConfig } from "./view-config.js";
import { renderLog } from "./view-log.js";
import { renderModules } from "./view-modules.js";
import { renderOverview } from "./view-overview.js";
import { renderSetup, setupProgress } from "./view-setup.js";

const root = document.getElementById("app");

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
  go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
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

function navLink(hash, iconName, label, badge) {
  const active = location.hash.startsWith(hash) || (hash === "#/chats" && location.hash.startsWith("#/chat/"));
  return h("a", { href: hash, class: active ? "on" : "" }, icon(iconName), h("span", null, label), badge ? h("span", { class: "badge" }, badge) : null);
}

function renderNav() {
  if (!nav || !app.status) return;
  const progress = setupProgress(app.status);
  fill(
    nav,
    h("div", { class: "brand" }, h("img", { src: "/admin/logo.webp", alt: "", width: 28, height: 28, onError: (e) => e.target.remove() }), `${app.botName}管理端`),
    progress.done < progress.total ? navLink("#/setup", "setup", "新手引导", `${progress.done}/${progress.total}`) : null,
    navLink("#/overview", "overview", "总览"),
    navLink("#/chats", "chats", "聊天"),
    navLink("#/modules", "modules", "模块"),
    navLink("#/config", "config", "配置"),
    navLink("#/log", "log", "操作记录"),
    progress.done >= progress.total ? navLink("#/setup", "setup", "引导与检查") : null,
    h("div", { class: "nav-foot" }, action([icon("logout"), "退出登录"], async () => {
      await api.del("session");
      start();
    })),
  );
}

async function route() {
  if (!main) return;
  stopView?.();
  stopView = undefined;
  const [name = "", ...args] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const view = VIEWS[name];
  if (!view) {
    const progress = setupProgress(app.status);
    location.replace(progress.required ? "#/setup" : "#/overview");
    return;
  }
  renderNav();
  // A view may give the page its own layout (the chat view fills the screen); start each one plain.
  main.className = "main";
  fill(main, h("p", { class: "muted" }, "加载中…"));
  try {
    const stop = await view(main, args, app);
    stopView = typeof stop === "function" ? stop : undefined;
  } catch (err) {
    fill(main, h("div", { class: "banner banner-bad" }, `加载失败：${err.message}`));
  }
  main.focus({ preventScroll: true });
}

function renderShell() {
  nav = h("nav", { class: "nav" });
  main = h("main", { class: "main", tabindex: "-1" });
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
      h("h1", null, "先设一个管理密码"),
      h("p", null, "管理端用环境变量 ADMIN_PASSWORD 保护，这是唯一需要在部署环境里手动设置的变量："),
      h("ol", null, steps.map((s) => h("li", null, s))),
      h("p", { class: "muted" }, "其余配置都能在这个页面里填，改了不用重新部署。"),
    ),
  );
}

function renderLogin() {
  const input = h("input", { id: "password", type: "password", autocomplete: "current-password", required: true });
  const error = h("p", { class: "field-error", hidden: true });
  const submit = h("button", { type: "submit", class: "btn btn-primary" }, "登录");
  const form = h(
    "form",
    {
      class: "gate",
      async onSubmit(e) {
        e.preventDefault();
        submit.disabled = true;
        error.hidden = true;
        try {
          await api.post("session", { password: input.value });
          await start();
        } catch (err) {
          error.hidden = false;
          error.textContent = err.message;
        } finally {
          submit.disabled = false;
        }
      },
    },
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
  const session = await api.get("session");
  app.botName = session.botName;
  document.title = `${app.botName}管理端`;
  if (!session.passwordSet) return renderNoPassword(session.howToSetPassword);
  if (!session.loggedIn) return renderLogin();
  await app.refreshStatus();
  renderShell();
}

window.addEventListener("hashchange", route);
window.addEventListener("admin:signed-out", () => {
  toast("登录已过期，请重新登录", "warn");
  start();
});
start().catch((err) => fill(root, h("div", { class: "gate" }, h("h1", null, "打不开管理端"), h("p", null, err.message))));
