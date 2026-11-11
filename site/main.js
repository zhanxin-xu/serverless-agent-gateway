const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/** Run `enter` when `el` scrolls into view and `leave` when it goes out (or the tab is hidden). */
const whileVisible = (el, enter, leave, threshold = 0.25) => {
  let on = false, inView = false;
  const update = () => {
    const now = inView && document.visibilityState === "visible";
    if (now === on) return;
    on = now;
    (on ? enter : leave)();
  };
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; update(); }, { threshold }).observe(el);
  document.addEventListener("visibilitychange", update);
};

/* ── nav: a glass pill once the page scrolls; the section in view is marked ── */
const nav = $("#nav");
const onScroll = () => nav.classList.toggle("stuck", scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
onScroll();
const links = new Map($$(".nav nav a").map((a) => [a.getAttribute("href").slice(1), a]));
const mark = (id) => links.forEach((a, key) => a.classList.toggle("on", key === id));
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) mark(links.has(e.target.id) ? e.target.id : null);
}, { rootMargin: "-45% 0px -50% 0px" });
// Every section is watched, so the mark clears over the ones the nav doesn't link to.
$$("main > section").forEach((s) => spy.observe(s));

/* ── reveal on enter ── */
const reveal = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); reveal.unobserve(e.target); }
}, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
$$("[data-reveal]").forEach((n) => reveal.observe(n));

/* ── count-up ── */
const counters = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    counters.unobserve(e.target);
    const n = e.target, to = parseFloat(n.dataset.count), suffix = n.dataset.suffix ?? "", dec = (n.dataset.count.split(".")[1] ?? "").length;
    if (reduced) { n.textContent = to.toFixed(dec) + suffix; continue; }
    const t0 = performance.now();
    const tick = (t) => { const k = easeOut(clamp((t - t0) / 1400)); n.textContent = (to * k).toFixed(dec) + suffix; if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
}, { threshold: 0.5 });
$$("[data-count]").forEach((n) => counters.observe(n));

/* ── copy + typed command ── */
for (const btn of $$(".copy")) btn.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = "已复制"; setTimeout(() => (btn.textContent = "复制"), 1400); } catch {}
});
const typed = $("#typed");
if (typed && !reduced) {
  const text = typed.dataset.text;
  new IntersectionObserver((entries, obs) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    obs.disconnect();
    typed.textContent = "";
    let i = 0;
    const step = () => { typed.textContent = text.slice(0, ++i); if (i < text.length) setTimeout(step, 70 + Math.random() * 90); };
    setTimeout(step, 250);
  }, { threshold: 0.6 }).observe(typed);
}

/* ══════════════════════════════════════════════════════════════
   The group chat in the hero. Each message carries when it appears
   (data-at, ms) and, for the bot's, how long she types first
   (data-typing). Plays on a loop while it's on screen.
   ══════════════════════════════════════════════════════════════ */
const demo = $("#demo");
if (demo && !reduced) {
  const body = $(".phone-body", demo), msgs = $$(".m", body);
  const HOLD = 5200, WIPE = 600;
  let timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  /** "She's typing": her picture and three dots, where her message will be. */
  const typingRow = (m) => {
    const row = document.createElement("div"), box = document.createElement("div"), dots = document.createElement("p");
    row.className = `m bot show typing${m.classList.contains("cont") ? " cont" : ""}`;
    dots.className = "b dots";
    dots.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    box.append(dots);
    row.append($("picture", m).cloneNode(true), box);
    return row;
  };
  const clear = () => {
    timers.forEach(clearTimeout);
    timers = [];
    $$(".typing", body).forEach((row) => row.replaceWith());
    msgs.forEach((m) => m.classList.remove("show"));
    body.classList.remove("wipe");
  };
  const play = () => {
    clear();
    let end = 0;
    for (const m of msgs) {
      const t = Number(m.dataset.at), typing = Number(m.dataset.typing ?? 0);
      let row;
      if (typing) at(t, () => body.insertBefore((row = typingRow(m)), m));
      at(t + typing, () => { row?.replaceWith(); m.classList.add("show"); });
      end = Math.max(end, t + typing);
    }
    at(end + HOLD, () => body.classList.add("wipe"));
    at(end + HOLD + WIPE, play);
  };
  whileVisible(demo, play, clear, 0.2);
}

/* ══════════════════════════════════════════════════════════════
   How it works: four steps beside the event stream. The lines a step
   wrote are lit; earlier ones stay dimmer, later ones dimmest. It
   advances on its own while on screen until a step is clicked.
   ══════════════════════════════════════════════════════════════ */
const stepList = $("#how-steps");
if (stepList) {
  const steps = $$("button", stepList), lines = $$("#stream li");
  const DWELL = 4200;
  let cur = 0, timer = 0, auto = !reduced;
  stepList.style.setProperty("--dwell", `${DWELL}ms`);
  const set = (i) => {
    cur = i;
    steps.forEach((b, k) => { b.classList.toggle("on", k === i); b.setAttribute("aria-pressed", String(k === i)); });
    for (const li of lines) {
      const s = Number(li.dataset.step);
      li.classList.toggle("lit", s < i);
      li.classList.toggle("now", s === i);
    }
  };
  const stop = () => { clearInterval(timer); timer = 0; stepList.classList.remove("auto"); };
  const start = () => {
    if (!auto || timer) return;
    stepList.classList.add("auto");
    timer = setInterval(() => set((cur + 1) % steps.length), DWELL);
  };
  steps.forEach((b, i) => b.addEventListener("click", () => { auto = false; stop(); set(i); }));
  set(0);
  whileVisible($(".how-grid"), start, stop, 0.3);
}
