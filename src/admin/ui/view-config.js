// Every setting, by group (#/config/<group>), with each group's checks.
// A module's page (src/modules) shows its own settings, which include the choice
// of provider, and below them a card per provider with that provider's settings.
import { api } from "./api.js";
import { action, copyable, fill, h, pill, toast } from "./dom.js";
import { groupActions, loadSettings, settingsForm } from "./form.js";
import { moduleState } from "./view-modules.js";

/** Pages that moved: the speech settings were the "tts" group before modules. */
const MOVED = { tts: "voice" };

export async function renderConfig(main, [groupParam], app) {
  if (MOVED[groupParam]) {
    location.replace(`#/config/${MOVED[groupParam]}`);
    return;
  }
  const [index, status] = [await loadSettings(), await app.refreshStatus()];
  // Providers' groups are shown inside their module's page, not in the list.
  const pages = index.groups.filter((g) => !g.provider);
  const group = pages.find((g) => g.id === groupParam) ?? pages[0];
  const channel = group.channel ? status.channels.find((c) => c.name === group.channel) : undefined;
  const module = group.module ? status.modules.find((m) => m.id === group.module) : undefined;
  const reload = async () => {
    await app.refreshStatus();
    app.go(`#/config/${group.id}`);
  };
  const slot = h("p", { class: "check-result" });
  const form = settingsForm(index, index.keysOf(group.id), { onSaved: reload, actions: (f) => groupActions(index, group, status, f, slot) });

  fill(
    main,
    h("header", { class: "page-head" }, h("h1", null, "配置"), h("p", { class: "muted" }, "保存后 30 秒内所有实例生效，不用重新部署。密钥只能替换，不能查看。")),
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
        h("h2", null, group.label, " ", channel ? (channel.configured ? pill("ok", "已配置") : pill("mute", "未配置")) : module ? moduleState(module) : null),
        h("p", { class: "muted" }, group.help),
        module && !module.ok && module.reason ? h("p", { class: "help" }, `没开启：${module.reason}`) : null,
        channel ? h("p", null, "回调地址：", copyable(channel.webhook)) : null,
        form.el,
        slot,
        module?.capability ? providerCards(index, status, module, reload) : null,
        group.id === "console" ? databaseCard(status, app) : null,
      ),
    ),
  );
}

/** One card per provider of the module's capability: in use, usable, or what it's missing; and its settings. */
function providerCards(index, status, module, reload) {
  const cap = module.capability;
  return [
    h("h3", null, `${cap.label}（${cap.providers.length} 个实现，同一时间只用一个）`),
    cap.providers.map((p) => {
      const group = index.groups.find((g) => g.id === p.settings);
      const inUse = cap.selected === p.id;
      const slot = h("p", { class: "check-result" });
      const form = settingsForm(index, index.keysOf(p.settings), { onSaved: reload, actions: (f) => groupActions(index, group, status, f, slot) });
      return h(
        "div",
        { class: "card" },
        h("h3", null, p.label, " ", inUse ? pill("ok", "在用") : p.available ? pill("info", "可用") : pill("mute", "未配置")),
        h("p", { class: "muted" }, p.description),
        !p.available && p.reason ? h("p", { class: "help" }, p.reason) : null,
        form.el,
        slot,
      );
    }),
  ];
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
