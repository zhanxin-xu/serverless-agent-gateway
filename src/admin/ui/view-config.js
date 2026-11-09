// The settings that don't belong to a module (#/config/<group>): channels, the agent, the
// console. Each module is configured on its own page (#/modules/<id>, view-modules.js).
import { api } from "./api.js";
import { action, copyable, fill, h, pill, toast } from "./dom.js";
import { groupActions, loadSettings, settingsForm } from "./form.js";

export async function renderConfig(main, [groupParam], app) {
  const [index, status] = [await loadSettings(), await app.refreshStatus()];
  const pages = index.groups.filter((g) => !g.module);
  const group = pages.find((g) => g.id === groupParam) ?? pages[0];
  const channel = group.channel ? status.channels.find((c) => c.name === group.channel) : undefined;
  const slot = h("p", { class: "check-result" });
  const form = settingsForm(index, index.keysOf(group.id), {
    onSaved: async () => {
      await app.refreshStatus();
      app.go(`#/config/${group.id}`);
    },
    actions: (f) => groupActions(index, group, status, f, slot),
  });

  fill(
    main,
    h(
      "header",
      { class: "page-head" },
      h("h1", null, "配置"),
      h("p", { class: "muted" }, "渠道、Agent 参数和管理端自己的设置。模型、画图、语音、搜索、记忆、沙盒在", h("a", { href: "#/modules" }, "模块"), "页里配置。保存后 30 秒内所有实例生效，不用重新部署；密钥只能替换，不能查看。"),
    ),
    h(
      "div",
      { class: "config" },
      h(
        "nav",
        { class: "subnav" },
        pages.map((g) => h("a", { href: `#/config/${g.id}`, class: g === group ? "on" : "" }, g.label)),
      ),
      h(
        "section",
        { class: "panel" },
        h("h2", null, group.label, " ", channel ? (channel.configured ? pill("ok", "已配置") : pill("mute", "未配置")) : null),
        h("p", { class: "muted" }, group.help),
        channel ? h("p", null, "回调地址：", copyable(channel.webhook)) : null,
        form.el,
        slot,
        group.id === "console" ? databaseCard(status, app) : null,
      ),
    ),
  );
}

function databaseCard(status, app) {
  const db = status.database;
  return h(
    "div",
    { class: "card" },
    h("h3", null, "数据库"),
    h(
      "p",
      null,
      db.backend === "supabase" ? `Supabase，表结构 v${db.schemaVersion ?? "无"}（代码需要 v${db.expected}）` : "内存（只适合本地开发）",
      " ",
      db.ready ? pill("ok", "已就绪") : pill("warn", "需要升级"),
    ),
    db.backend === "supabase" && db.connectionVar
      ? action("重新执行 schema.sql", async () => {
          await api.post("setup/database");
          toast("已执行");
          await app.refreshStatus();
          app.go("#/config/console");
        })
      : null,
  );
}
