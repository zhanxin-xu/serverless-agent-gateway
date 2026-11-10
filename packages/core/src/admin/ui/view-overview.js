// The overview: what's left on each module's service, today's usage across chats, recent problems.
import { api } from "./api.js";
import { every, fill, fmtAgo, fmtInt, fmtTokens, fmtUsd, h, meter, pill } from "./dom.js";

const REASONS = { error: "出错", unreachable: "平台连不上", "max-steps": "步数用完" };

/** What's left on one key or account, and which modules spend from it (src/modules/balance.ts). */
function balanceTile(b) {
  if (b.error) return h("div", { class: "tile" }, h("span", { class: "k" }, b.label), pill("bad", "查询失败"), h("span", { class: "s" }, b.error));
  return h(
    "div",
    { class: "tile" },
    h("span", { class: "k" }, b.label),
    h("span", { class: "v" }, b.value),
    b.used !== undefined ? meter(b.used) : null,
    b.detail ? h("span", { class: "s" }, b.detail) : null,
  );
}

/** What one provider instance spent today and this month, against its budgets (src/modules/spend.ts). */
function spendTile(s) {
  const limit = (used, budget) => (budget === undefined ? fmtUsd(used) : `${fmtUsd(used)} / ${fmtUsd(budget)}`);
  const ratio = s.dailyBudget !== undefined ? (s.dailyBudget ? s.day / s.dailyBudget : 1) : s.monthlyBudget !== undefined ? (s.monthlyBudget ? s.month / s.monthlyBudget : 1) : undefined;
  const used = (s.dailyBudget !== undefined && s.day >= s.dailyBudget) || (s.monthlyBudget !== undefined && s.month >= s.monthlyBudget);
  return h(
    "div",
    { class: "tile" },
    h("span", { class: "k" }, `${s.label} 今日花费`, used ? [" ", pill("bad", "已到上限")] : null),
    h("span", { class: "v" }, limit(s.day, s.dailyBudget)),
    ratio !== undefined ? meter(ratio) : null,
    h("span", { class: "s" }, `${fmtInt(s.calls)} 次调用 · 本月 ${limit(s.month, s.monthlyBudget)}${s.dailyBudget === undefined && s.monthlyBudget === undefined ? " · 没设上限" : ""}`),
  );
}

export async function renderOverview(main, _args, app) {
  const body = h("div", { class: "stack" });
  fill(main, h("header", { class: "page-head" }, h("h1", null, "总览"), h("p", { class: "muted" }, "花费、额度和最近出的问题。每天北京时间 08:00 重置。")), body);

  const render = async () => {
    const o = await api.get("overview");
    const t = o.today.total;
    // Each metered module's counter (src/modules: Module.meter).
    const meters = (app.status?.modules ?? []).filter((m) => m.meter).map((m) => m.meter);
    fill(
      body,
      h(
        "div",
        { class: "tiles" },
        o.balances.map(balanceTile),
        o.spend.map(spendTile),
        h(
          "div",
          { class: "tile" },
          h("span", { class: "k" }, "今日轮次"),
          h("span", { class: "v" }, fmtInt(t.turns)),
          h("span", { class: "s" }, `${o.today.chats} 个聊天 · 估算 ${fmtUsd(t.cost_usd)} · 输入 ${fmtTokens(t.input_tokens)}（缓存 ${fmtTokens(t.cached_tokens)}）`),
        ),
        meters.length
          ? h(
              "div",
              { class: "tile" },
              h("span", { class: "k" }, "今日模块用量"),
              h("span", { class: "v" }, meters.map((m) => `${fmtInt(t[m.key])}`).join(" / ")),
              h("span", { class: "s" }, meters.map((m) => m.label).join(" / ")),
            )
          : null,
      ),
      h("div", { class: "row" }, o.channels.map((c) => pill(c.configured ? "ok" : "mute", `${c.name} ${c.configured ? "已接入" : "未配置"}`))),
      h("h2", null, "最近 24 小时的问题"),
      o.problems.length
        ? h(
            "div",
            { class: "table-wrap" },
            h(
              "table",
              null,
              h("thead", null, h("tr", null, h("th", null, "时间"), h("th", null, "聊天"), h("th", null, "情况"))),
              h(
                "tbody",
                null,
                o.problems.map((p) =>
                  h(
                    "tr",
                    null,
                    h("td", { class: "nowrap" }, fmtAgo(p.time)),
                    h("td", null, h("a", { href: `#/chat/${encodeURIComponent(p.chat)}/events` }, p.chat)),
                    h("td", null, pill(p.reason === "error" ? "bad" : "warn", REASONS[p.reason] ?? p.reason), ` 第 ${p.turn} 轮 `, h("span", { class: "muted" }, p.error ?? "")),
                  ),
                ),
              ),
            ),
          )
        : h("p", { class: "muted" }, "没有。"),
    );
  };
  await render();
  return every(30_000, render);
}
