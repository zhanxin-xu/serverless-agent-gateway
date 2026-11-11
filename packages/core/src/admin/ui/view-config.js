// The settings that don't belong to a module (#/config/<group>): channels, the agent, the
// console. Each module is configured on its own page (#/modules/<id>, view-modules.js).
import { api } from "./api.js";
import { action, copyable, fill, h, pageHead, pill, section, tabs, toast } from "./dom.js";
import { focusSetting, groupActions, loadSettings, settingsForm } from "./form.js";

export async function renderConfig(main, [groupParam, focus], app) {
  const [index, status] = [await loadSettings(), await app.refreshStatus()];
  const pages = index.groups.filter((g) => !g.module);
  // A channel's group is also reached by the channel's name (the overview links there).
  const group = pages.find((g) => g.id === groupParam) ?? pages.find((g) => g.channel === groupParam) ?? pages[0];
  const page = `#/config/${group.id}`;
  const channelOf = (g) => (g.channel ? status.channels.find((c) => c.name === g.channel) : undefined);
  const channel = channelOf(group);
  const slot = h("p", { class: "check-result" });
  const form = settingsForm(index, index.keysOf(group.id), {
    onSaved: async () => {
      await app.refreshStatus();
      app.go(page);
    },
    actions: (f) => groupActions(index, group, status, f, slot),
  });

  fill(
    main,
    pageHead({
      title: "配置",
      sub: [
        "渠道、Agent 参数、计价和管理端自己的设置。",
        status.modules.filter((m) => m.settings).map((m) => m.label).join("、"),
        "在",
        h("a", { href: "#/modules" }, "模块"),
        "页里配置。保存后 30 秒内所有实例生效，不用重新部署；密钥只能替换，不能查看。",
      ],
    }),
    // A channel's tab carries a dot: green once it's connected.
    tabs(pages.map((g) => [`#/config/${g.id}`, g.label, channelOf(g) ? h("span", { class: `dot ${channelOf(g).configured ? "ok" : ""}`, title: channelOf(g).configured ? "已配置" : "未配置" }) : null]), page),
    h(
      "div",
      { class: "panel pad" },
      h("div", { class: "row" }, h("h2", null, group.label), channel ? (channel.configured ? pill("ok", "已配置") : pill("mute", "未配置")) : null),
      group.help ? h("p", { class: "muted" }, group.help) : null,
      channel ? h("p", null, "回调地址：", copyable(channel.webhook)) : null,
      form.el,
      slot,
    ),
    group.id === "console" ? databaseSection(status, app) : null,
  );

  if (focus) {
    // Once the page is on screen: bring the setting the address names into view, then drop it from the address.
    setTimeout(() => {
      focusSetting(focus);
      app.settle(page);
    }, 0);
  }
}

function databaseSection(status, app) {
  const db = status.database;
  return section(
    "数据库",
    null,
    h(
      "div",
      { class: "panel pad" },
      h(
        "p",
        null,
        !db.connected ? pill("warn", "未连接") : db.ready ? pill("ok", "已就绪") : pill("warn", "需要升级"),
        " ",
        db.connected ? `${db.label}，表结构 v${db.version ?? "无"}（代码需要 v${db.expected}）` : `${db.label}：没连上，数据只在内存里，重启就没了`,
      ),
      db.connected && db.canApply
        ? h(
            "div",
            { class: "row" },
            action("重新建表（可重复执行）", async () => {
              await api.post("setup/database");
              toast("已执行");
              await app.refreshStatus();
              app.go("#/config/console");
            }),
          )
        : null,
    ),
  );
}
