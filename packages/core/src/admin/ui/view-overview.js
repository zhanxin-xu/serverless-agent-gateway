// The overview: today's usage across chats, what each metered module spent against its
// budgets, what's left on each service, the channels, and recent problems.
import { api } from "./api.js";
import { ago, empty, every, fill, fmtClock, fmtInt, fmtTokens, fmtUsd, h, meter, notice, pageHead, pill, section } from "./dom.js";
import { icon } from "./icons.js";
import { setupProgress } from "./view-setup.js";

const REASONS = { error: "出错", unreachable: "平台连不上", "max-steps": "步数用完" };

const stat = (k, v, s) => h("div", { class: "stat" }, h("span", { class: "k" }, k), h("span", { class: "v" }, v), s ? h("span", { class: "s" }, s) : null);

const table = (head, rows) =>
  h("div", { class: "table-wrap" }, h("table", null, h("thead", null, h("tr", null, head.map((c) => (typeof c === "string" ? h("th", null, c) : c)))), h("tbody", null, rows)));

/** Spent against a budget: a bar and "$0.42 / $5.00"; just the amount where there's no budget. */
function spent(used, budget) {
  if (budget === undefined) return h("span", { class: "num" }, fmtUsd(used), h("span", { class: "faint" }, " · 没设上限"));
  const full = used >= budget;
  return h("div", { class: "cell-meter" }, meter(budget ? used / budget : 1), h("span", null, `${fmtUsd(used)} / ${fmtUsd(budget)}`, full ? [" ", pill("bad", "已到上限")] : null));
}

/** What one metered module spent today and this month, every chat together (src/modules/spend.ts). */
const spendRow = (s) =>
  h(
    "tr",
    null,
    h("td", null, h("a", { class: "name", href: `#/modules/${s.module}` }, s.label)),
    h("td", null, spent(s.day, s.dailyBudget)),
    h("td", null, spent(s.month, s.monthlyBudget)),
    h("td", { class: "num" }, fmtInt(s.calls)),
    h("td", { class: "num" }, h("a", { href: `#/modules/${s.module}/${s.module.toUpperCase()}_DAILY_BUDGET_USD` }, "设上限")),
  );

/** What's left on one key or account, and which modules spend from it (src/modules/balance.ts). */
const balanceRow = (b) =>
  h(
    "tr",
    null,
    h("td", null, h("b", null, b.label)),
    b.error
      ? h("td", { colspan: 2 }, pill("bad", "查询失败"), " ", h("span", { class: "muted" }, b.error))
      : [h("td", null, b.used !== undefined ? h("div", { class: "cell-meter" }, meter(b.used), h("span", null, b.value)) : h("span", { class: "num" }, b.value)), h("td", { class: "muted" }, b.detail ?? "")],
  );

export async function renderOverview(main, _args, app) {
  const body = h("div", { class: "stack" });
  const updated = h("span");
  const refresh = h("button", { type: "button", class: "icon-btn", title: "刷新", "aria-label": "刷新" }, icon("refresh"));
  fill(main, pageHead({ title: "总览", sub: "今天的用量、花费上限和最近出的问题。每天北京时间 08:00 重置。", actions: [updated, refresh] }), body);

  const render = async () => {
    const o = await api.get("overview");
    const status = app.status;
    const t = o.today.total;
    const input = t.input_tokens ?? 0;
    // Each metered module's counter (src/modules: Module.meter).
    const meters = (status?.modules ?? []).filter((m) => m.meter).map((m) => m.meter);
    const labels = new Map((status?.channels ?? []).map((c) => [c.name, c.label]));
    const progress = setupProgress(status);
    updated.textContent = `更新于 ${fmtClock(Date.now())}`;
    fill(
      body,
      progress.required ? notice("warn", "还没配置完，机器人现在收不到或回不了消息。", h("a", { class: "btn btn-small", href: "#/setup" }, "继续配置")) : null,
      section(
        "今天",
        `${o.today.chats} 个聊天有动静`,
        h(
          "div",
          { class: "stats" },
          stat("轮次", fmtInt(t.turns)),
          stat("模型花费", fmtUsd(t.cost_usd), "按调用估算"),
          stat("输入 token", fmtTokens(input), `其中缓存 ${fmtTokens(t.cached_tokens)}`),
          stat("缓存命中", input ? [((100 * (t.cached_tokens ?? 0)) / input).toFixed(1), h("small", null, " %")] : "—"),
          meters.map((m) => stat(m.label, fmtInt(t[m.key]))),
        ),
      ),
      o.spend.length
        ? section("花费上限", "所有聊天合计，到了上限就停", table(["模块", "今日", "本月", h("th", { class: "num" }, "今日调用"), ""], o.spend.map(spendRow)))
        : null,
      o.balances.length ? section("余额", null, table(["服务", "剩余", "说明"], o.balances.map(balanceRow))) : null,
      section(
        "渠道",
        null,
        table(
          ["渠道", "状态", ""],
          o.channels.map((c) =>
            h(
              "tr",
              null,
              h("td", null, h("b", null, labels.get(c.name) ?? c.name)),
              h("td", null, c.configured ? pill("ok", "已接入") : pill("mute", "未配置")),
              h("td", { class: "num" }, h("a", { href: `#/config/${c.name}` }, c.configured ? "查看" : "去配置")),
            ),
          ),
        ),
      ),
      section(
        "最近 24 小时的问题",
        o.problems.length ? `${o.problems.length} 个` : null,
        o.problems.length
          ? table(
              ["时间", "聊天", "情况"],
              o.problems.map((p) =>
                h(
                  "tr",
                  null,
                  h("td", null, ago(p.time)),
                  h("td", null, h("a", { href: `#/chat/${encodeURIComponent(p.chat)}/events` }, p.chat)),
                  h("td", { class: "wrap" }, pill(p.reason === "error" ? "bad" : "warn", REASONS[p.reason] ?? p.reason), ` 第 ${p.turn} 轮 `, h("span", { class: "muted" }, p.error ?? "")),
                ),
              ),
            )
          : h("div", { class: "panel" }, empty("没有，一切正常。")),
      ),
    );
  };
  refresh.addEventListener("click", () => render().catch(() => {}));
  await render();
  return every(30_000, render);
}
