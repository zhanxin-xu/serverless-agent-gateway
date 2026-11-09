// The setup guide: from nothing configured to the first message, one step at a time.
// Steps are derived from GET status, so the guide also works as a checklist later.
import { api } from "./api.js";
import { action, copy, copyable, every, fill, h, pill, toast } from "./dom.js";
import { checkResult, groupActions, loadSettings, settingsForm } from "./form.js";
import { moduleState } from "./view-modules.js";

const SKIP_KEY = "admin.setup.skipFeatures";
const skippedFeatures = () => {
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
};

function steps(s) {
  return [
    { id: "password", title: "管理密码", done: true },
    { id: "database", title: "数据库", done: s.database.connected && s.database.ready },
    // A step for each module the bot can't work without (src/modules: setup "required"): the chat model.
    ...s.modules.filter((m) => m.setup === "required").map((m) => ({ id: `module-${m.id}`, module: m, title: m.label, done: m.ok })),
    { id: "channels", title: "接入渠道", done: s.channels.some((c) => c.configured) },
    { id: "features", title: "可选模块", optional: true, done: s.modules.some((m) => !m.core && m.ok) || skippedFeatures() },
    { id: "first", title: "发条消息试试", done: s.firstMessage },
  ];
}

/** How far setup is: steps done, and whether a required one is missing. */
export function setupProgress(status) {
  if (!status) return { done: 0, total: 0, required: true };
  const all = steps(status);
  return { done: all.filter((s) => s.done).length, total: all.length, required: all.some((s) => !s.done && !s.optional) };
}

export async function renderSetup(main, [stepId], app) {
  const status = await app.refreshStatus();
  const all = steps(status);
  const current = all.find((s) => s.id === stepId) ?? all.find((s) => !s.done) ?? all.at(-1);
  const panel = h("section", { class: "panel" });
  const next = () => {
    const after = all[all.indexOf(current) + 1];
    app.go(after ? `#/setup/${after.id}` : "#/overview");
  };

  fill(
    main,
    h("header", { class: "page-head" }, h("h1", null, "新手引导"), h("p", { class: "muted" }, "从零配置到收到第一条消息。每一步都可以回来改，配置页里有全部选项。")),
    h(
      "div",
      { class: "setup" },
      h(
        "ol",
        { class: "steps" },
        all.map((s, i) =>
          h(
            "li",
            null,
            h(
              "a",
              { href: `#/setup/${s.id}`, class: `step${s.done ? " done" : ""}${s === current ? " now" : ""}` },
              h("span", { class: "dot" }, s.done ? "✓" : String(i + 1)),
              h("span", null, s.title),
              s.optional ? h("span", { class: "opt" }, "可跳过") : null,
            ),
          ),
        ),
      ),
      panel,
    ),
  );
  return current.module ? requiredModule(current.module, panel, status, app, next) : STEP_VIEWS[current.id](panel, status, app, next);
}

const STEP_VIEWS = {
  password(panel, status, _app, next) {
    fill(
      panel,
      h("h2", null, "管理密码"),
      h("p", null, pill("ok", "已设置"), " 你已经用它登录了。"),
      h("p", { class: "muted" }, status.guide.changePassword),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn btn-primary", onClick: next }, "下一步")),
    );
  },

  async database(panel, status, app, next) {
    // What the database is and how to connect it depend on the deployment (src/composition.ts).
    const db = status.database;
    if (!db.connected) {
      const how = status.guide.database;
      return fill(panel, h("h2", null, "连接数据库"), h("p", null, how.intro), h("ol", null, how.steps.map((s) => h("li", null, s))));
    }
    if (db.ready) {
      return fill(
        panel,
        h("h2", null, "数据库"),
        h("p", null, pill("ok", "已就绪"), ` ${db.label}，表结构 v${db.version}。`),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn btn-primary", onClick: next }, "下一步")),
      );
    }
    const upgrade = db.version !== null;
    const result = h("p", { class: "check-result" });
    const runIt = action(upgrade ? `升级到 v${db.expected}` : "建表", async () => {
      fill(result, h("span", { class: "muted" }, "执行中…"));
      try {
        await api.post("setup/database");
      } catch (err) {
        checkResult(result, { ok: false, message: err.message });
        return;
      }
      toast("数据库已就绪");
      await app.refreshStatus();
      app.go("#/setup/database");
    }, { primary: true });
    const manual = h("details", { class: "manual" });
    manual.addEventListener("toggle", async () => {
      if (!manual.open || manual.dataset.loaded) return;
      manual.dataset.loaded = "1";
      const { sql } = await api.get("setup/schema");
      const pre = h("pre", { class: "sql" }, sql);
      manual.append(
        h("p", null, db.manualNote),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn", onClick: () => copy(sql, pre) }, "复制 SQL"), action("检测", async () => {
          await app.refreshStatus();
          app.go("#/setup/database");
        })),
        pre,
      );
    });
    manual.append(h("summary", null, "手动执行 SQL"));
    return fill(
      panel,
      h("h2", null, upgrade ? "升级数据库" : "创建数据表"),
      h("p", null, upgrade ? `数据库的表结构是 v${db.version}，这个版本的代码需要 v${db.expected}。升级不会删数据，机器人在升级前后都能照常工作。` : `${db.label} 已经连上，还需要建表。`),
      db.canApply
        ? h("div", null, h("p", { class: "muted" }, db.applyNote), h("div", { class: "row" }, runIt), result)
        : h("p", { class: "muted" }, db.applyNote),
      manual,
    );
  },

  async channels(panel, status, app, next) {
    if (!requireDb(panel, status)) return;
    const index = await loadSettings();
    const refresh = async () => {
      await app.refreshStatus();
      app.go("#/setup/channels");
    };
    const card = (channel) => {
      const group = index.groups.find((g) => g.channel === channel.name);
      if (!group) return null;
      const slot = h("p", { class: "check-result" });
      // What connect fills in isn't typed by hand.
      const keys = index.keysOf(group.id).filter((k) => !index.defs.get(k).setByConnect);
      const form = settingsForm(index, keys, { onSaved: refresh, actions: (f) => groupActions(index, group, status, f, slot) });
      return h(
        "div",
        { class: "card" },
        h("h3", null, channel.label, " ", channel.configured ? pill("ok", "已配置") : pill("mute", "未配置")),
        h("p", { class: "muted" }, group.help),
        h("p", null, "回调地址：", copyable(channel.webhook)),
        form.el,
        slot,
      );
    };
    fill(
      panel,
      h("h2", null, "接入渠道"),
      h("p", { class: "muted" }, "至少接一个。改完立即生效，不用重新部署。"),
      status.channels.map(card),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn", onClick: next, disabled: !status.channels.some((c) => c.configured) }, "下一步")),
    );
  },

  async features(panel, status, app, next) {
    if (!requireDb(panel, status)) return;
    const index = await loadSettings();
    const byId = new Map(status.modules.map((m) => [m.id, m]));
    fill(
      panel,
      h("h2", null, "可选模块"),
      h(
        "p",
        { class: "muted" },
        `${status.modules.filter((m) => !m.core).map((m) => m.label).join("、")}都是可选模块，都可以跳过，以后在模块页再开。这里只填开启需要的最少几项，其余参数在模块页。`,
      ),
      status.modules
        .filter((m) => !m.core)
        .map((m) => {
          // The provider in use, or the first: its essential settings turn the module on.
          const cap = m.capability;
          const provider = cap.providers.find((p) => p.id === cap.selected) ?? cap.providers[0];
          const group = index.groups.find((g) => g.id === provider.settings);
          const keys = group.essentials ?? index.keysOf(group.id);
          const slot = h("p", { class: "check-result" });
          const form = settingsForm(index, keys, { onSaved: () => app.refreshStatus(), actions: (f) => groupActions(index, group, status, f, slot) });
          return h(
            "div",
            { class: "card" },
            h("div", { class: "row between" }, h("h3", null, m.label, " ", moduleState(m)), h("a", { class: "btn btn-small", href: `#/modules/${m.id}` }, "全部配置")),
            h("p", { class: "muted" }, m.summary, m.requires.length ? ` 需要先开启${m.requires.map((id) => byId.get(id)?.label ?? id).join("、")}。` : ""),
            h("p", { class: "help" }, `${provider.label}：${provider.description}`, cap.providers.length > 1 ? `（还有 ${cap.providers.length - 1} 个实现可选，在配置页切换）` : ""),
            form.el,
            slot,
          );
        }),
      h(
        "div",
        { class: "row" },
        h("button", {
          type: "button",
          class: "btn btn-primary",
          onClick() {
            try {
              localStorage.setItem(SKIP_KEY, "1");
            } catch {}
            app.refreshStatus().then(next);
          },
        }, "好了，下一步"),
      ),
    );
  },

  first(panel, status, app) {
    const render = (s) =>
      fill(
        panel,
        h("h2", null, "发条消息试试"),
        s.firstMessage
          ? [
              h("p", null, pill("ok", "收到了"), " 机器人已经收到消息。可以在聊天页看记录和事件，或者去总览看看。"),
              h("div", { class: "row" }, h("a", { class: "btn btn-primary", href: "#/chats" }, "去看聊天"), h("a", { class: "btn", href: "#/overview" }, "总览")),
            ]
          : [
              h("p", null, "在接好的渠道里给机器人发条消息：私聊它，或者在群里 @ 它。收到以后这里会自动打勾。"),
              h("p", { class: "muted" }, "等待第一条消息…"),
            ],
      );
    render(status);
    if (status.firstMessage) return;
    return every(5000, async () => {
      const s = await app.refreshStatus();
      render(s);
    });
  },
};

/** A module the bot can't work without: its essential settings and its check, until it's ready. */
async function requiredModule(m, panel, status, app, next) {
  if (!requireDb(panel, status)) return;
  const index = await loadSettings();
  const group = index.groups.find((g) => g.id === m.settings);
  const form = settingsForm(index, group.essentials ?? index.keysOf(group.id), {
    onSaved: async () => {
      await app.refreshStatus();
      app.go(`#/setup/module-${m.id}`);
    },
    actions: (f) => groupActions(index, group, status, f, null),
  });
  fill(
    panel,
    h("h2", null, m.label, " ", m.ok ? pill("ok", "已就绪") : pill("warn", "未就绪")),
    h("p", { class: "muted" }, group.help, m.canCheck ? " “检查”会先保存，再真的调用一次。" : ""),
    !m.ok && m.reason ? h("p", { class: "help" }, m.reason) : null,
    form.el,
    h(
      "div",
      { class: "row" },
      h("button", { type: "button", class: "btn", onClick: next, disabled: !m.ok }, "下一步"),
      h("a", { class: "btn btn-small", href: `#/modules/${m.id}` }, "全部配置"),
    ),
  );
}

/** Settings need the database; the in-memory store (local development) works too, for this instance. */
function requireDb(panel, status) {
  if (status.database.ready) return true;
  fill(panel, h("p", null, "先完成上一步“数据库”：设置要存进数据库。"), h("a", { class: "btn btn-primary", href: "#/setup/database" }, "去连接数据库"));
  return false;
}
