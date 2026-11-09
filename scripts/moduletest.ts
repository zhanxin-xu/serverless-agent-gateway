/**
 * Modules, capabilities and the system prompt (docs/design/modules.md 10):
 * `npm test` runs it after selftest.ts. Offline: no service is called.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Every optional module configured (fake values), as in a full deployment.
const FULL = {
  OPENAI_RESPONSES_API_KEY: "k",
  DEEPSEEK_API_KEY: "k",
  IMAGE_API_KEY: "k",
  TTS_API_KEY: "k",
  UPSTASH_VECTOR_REST_URL: "https://vector.example.com",
  UPSTASH_VECTOR_REST_TOKEN: "k",
  SANDBOX_ENABLED: "1",
};
Object.assign(process.env, FULL);
for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "VERCEL", "VERCEL_OIDC_TOKEN"]) delete process.env[name];

const { MODULES, OPTIONAL_MODULES, Toolset, moduleOfTool, moduleStatus, activeModules } = await import("../src/modules/registry.js");
const { select } = await import("../src/modules/capability.js");
const { assemble } = await import("../src/prompt/assemble.js");
const { interpolate } = await import("../src/prompt/variables.js");
const { PERSONA } = await import("../src/prompt/persona.js");
const { RULES, SCENE_RULES } = await import("../src/prompt/rules.js");
const { SETTING_GROUPS, SETTINGS, settingDef } = await import("../src/settings/catalog.js");
const { parseProfile, storedProfile, PROFILE_CHOICES } = await import("../src/chats/profile.js");
const { turnUsage, quotaPolicy } = await import("../src/chats/usage.js");
const { channels } = await import("../src/channels/index.js");

let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}\n`, err);
  }
}

/** Run `fn` with some settings changed in the environment, then put them back. */
async function withEnv(changes: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const saved = Object.fromEntries(Object.keys(changes).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(changes)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
}

const allToolNames = MODULES.flatMap((m) => m.tools.map((t) => t.name));
const prompt = (chatType: "private" | "group", off: string[] = []) =>
  assemble({ chatType, channelHint: channels.get("qq")!.promptHint, toolset: new Toolset({ disabled: new Set(off) }) });

await test("every module is on when everything is configured", () => {
  assert.deepEqual(
    activeModules().map((m) => m.id),
    MODULES.map((m) => m.id),
  );
});

await test("the persona, the rules and the scenes name no tools", () => {
  for (const [where, text] of [["persona", PERSONA], ["rules", RULES], ["private", SCENE_RULES.private], ["group", SCENE_RULES.group]]) {
    for (const name of allToolNames) assert.ok(!text!.includes(name), `${where} names ${name}`);
  }
});

await test("sections come in the order of src/prompt/order.ts, empty ones left out", () => {
  const a = prompt("group");
  const names = a.sections.map((s) => s.name);
  assert.deepEqual(names.slice(0, 4), ["persona", "rules", "scene", "channel"]);
  assert.ok(names.indexOf("module:chat") < names.indexOf("module:memory") && names.indexOf("module:image") < names.indexOf("module:voice"));
  assert.ok(!names.includes("module:basics"), "a module without a section adds nothing");
  assert.ok(!names.includes("chat:extra"), "no extra instructions, no section");
  assert.deepEqual([...a.sections].sort((x, y) => x.order - y.order), a.sections);
  assert.equal(a.prompt, a.sections.map((s) => s.text).join("\n\n"));
  const withExtra = assemble({ chatType: "group", chatExtra: "说话学术一点", toolset: new Toolset() });
  assert.equal(withExtra.sections.at(-1)!.name, "chat:extra", "the chat's own instructions come last");
});

await test("the same chat and settings give the same prompt, byte for byte (the prompt cache depends on it)", () => {
  assert.equal(prompt("group").prompt, prompt("group").prompt);
  assert.deepEqual(prompt("group").tools, prompt("group").tools);
});

await test("a module turned off takes its tools and its section along, and no other section names its tools", () => {
  for (const module of OPTIONAL_MODULES) {
    const a = prompt("group", [module.id]);
    const own = module.tools.map((t) => t.name);
    assert.ok(!a.sections.some((s) => s.name === `module:${module.id}`), `${module.id}'s section left out`);
    for (const name of own) {
      assert.ok(!a.tools.some((t) => t.name === name), `${name} not offered`);
      assert.ok(!a.prompt.includes(name), `the prompt still names ${name} with ${module.id} off`);
    }
  }
});

await test("turning one module off leaves every other section as it was", () => {
  const all = Object.fromEntries(prompt("group").sections.map((s) => [s.name, s.text]));
  for (const module of OPTIONAL_MODULES) {
    for (const s of prompt("group", [module.id]).sections) {
      // Another module may drop a line about this one's tools (voice mentions remember); nothing else changes.
      if (s.text !== all[s.name]) {
        const dropped = all[s.name]!.length - s.text.length;
        assert.ok(dropped > 0 && module.tools.some((t) => all[s.name]!.includes(t.name)), `${s.name} changed with ${module.id} off`);
      }
    }
  }
});

await test("a module whose requirement is off is off too, saying why", async () => {
  await withEnv({ SANDBOX_ENABLED: "0" }, () => {
    const image = MODULES.find((m) => m.id === "image")!;
    const status = moduleStatus(image);
    assert.equal(status.ok, false);
    assert.match((status as { reason: string }).reason, /需要先开启沙盒/);
    assert.ok(!new Toolset().has("generate_image"));
  });
  // A chat turning the sandbox off turns its images off too.
  assert.ok(!new Toolset({ disabled: new Set(["sandbox"]) }).has("generate_image"));
});

await test("choosing a provider: chosen, automatic, missing, unconfigured, none, several", async () => {
  const provider = (id: string, ok: boolean) => ({
    id,
    label: id.toUpperCase(),
    description: "",
    settings: "x",
    available: () => (ok ? ({ ok: true } as const) : ({ ok: false, reason: `${id} 缺 key` } as const)),
    create: () => id,
  });
  const cap = (...providers: ReturnType<typeof provider>[]) => ({ id: "t", label: "测试服务", selectionSetting: "TEST_PROVIDER", providers });
  await withEnv({ TEST_PROVIDER: undefined }, () => {
    assert.equal((select(cap(provider("a", true), provider("b", false))) as any).provider.id, "a", "the one usable");
    assert.match((select(cap(provider("a", false))) as any).reason, /a 缺 key/, "the only provider says what's missing");
    assert.match((select(cap(provider("a", false), provider("b", false))) as any).reason, /还没有配置任何测试服务/);
    assert.match((select(cap(provider("a", true), provider("b", true))) as any).reason, /有 2 个可用的测试服务（A、B），请在配置页选一个/);
  });
  await withEnv({ TEST_PROVIDER: "b" }, () => {
    assert.equal((select(cap(provider("a", true), provider("b", true))) as any).provider.id, "b", "chosen wins");
    assert.match((select(cap(provider("a", true), provider("b", false))) as any).reason, /^B：b 缺 key/, "chosen but not configured");
  });
  await withEnv({ TEST_PROVIDER: "zzz" }, () => {
    assert.match((select(cap(provider("a", true))) as any).reason, /TEST_PROVIDER 选的是 zzz，但没有这个实现/);
  });
});

await test("an undefined {{variable}} stops the prompt instead of reaching the model", () => {
  assert.equal(interpolate("我是{{bot_name}}", "t"), "我是大肥鱼");
  assert.throws(() => interpolate("{{nope}}", "module:x"), /module:x uses \{\{nope\}\}/);
});

await test("the voice section follows the speech model's dialect", async () => {
  const voice = () => prompt("group").sections.find((s) => s.name === "module:voice")!.text;
  assert.match(voice(), /现在是 Fish 模型/);
  assert.match(voice(), /send_voice\(text="\[得意地\]/);
  await withEnv({ TTS_MODEL: "bytedance-seed/seed-audio-1.0" }, () => {
    assert.match(voice(), /现在是 Seed 模型/);
    assert.doesNotMatch(voice(), /\[得意地\]/, "no inline tags in Seed's example");
    assert.match(new Toolset().definitions().find((d) => d.name === "send_voice")!.description, /ByteDance Seed/);
  });
});

await test("balances belong to their modules", () => {
  const tools = (id: string) => MODULES.find((m) => m.id === id)!.tools.map((t) => t.name);
  assert.ok(tools("model").includes("get_llm_key_limit"));
  assert.ok(tools("search").includes("get_search_balance"));
  assert.ok(tools("image").includes("get_image_key_limit"));
  assert.ok(MODULES.filter((m) => m.balance).every((m) => ["model", "search", "image"].includes(m.id)));
});

await test("meters count only their own tools, under counters usage_daily already has", () => {
  for (const m of MODULES.filter((x) => x.meter)) {
    assert.ok(["images", "voices", "searches"].includes(m.meter!.key), `${m.id}: ${m.meter!.key}`);
    for (const name of m.meter!.tools) assert.equal(moduleOfTool(name), m, `${name} belongs to ${m.id}`);
  }
  // The same events counted as before the refactor (METERED: image → images, voice → voices, search → searches).
  const ev = (seq: number, type: string, data: object) => ({ seq, type, time: seq, data }) as any;
  const call = (seq: number, name: string, id: string) => ev(seq, "tool/call", { turn: 1, step: 1, callId: id, name });
  const counts = turnUsage([
    ev(0, "turn/start", { turn: 1, trigger: "direct" }),
    call(1, "web_search", "a"),
    call(2, "web_fetch", "b"),
    call(3, "get_search_balance", "c"),
    call(4, "generate_image", "d"),
    call(5, "get_image_key_limit", "e"),
    call(6, "send_voice", "f"),
    call(7, "remember", "g"),
    call(8, "bash", "h"),
    call(9, "send_voice", "i"),
    ev(10, "tool/result", { turn: 1, step: 1, callId: "i", output: "Error: failed" }),
  ]);
  assert.deepEqual(counts, { turns: 1, searches: 2, images: 1, voices: 1 });
  // A quota refuses the metered tools only.
  const policy = quotaPolicy({ quota: { searches: 1, images: 0 } }, { searches: 1 });
  const tool = (name: string) => MODULES.flatMap((m) => m.tools).find((t) => t.name === name)!;
  assert.match(policy.refuse!(tool("web_search"), undefined)!, /daily quota for web_search/);
  assert.match(policy.refuse!(tool("generate_image"), undefined)!, /daily quota for generate_image/);
  assert.equal(policy.refuse!(tool("get_search_balance"), undefined), undefined);
  assert.equal(policy.refuse!(tool("get_image_key_limit"), undefined), undefined);
});

await test("a chat's switches: disabledModules, read from profiles stored before it as disabledTools", () => {
  assert.deepEqual(parseProfile({ disabledTools: ["memory"] }), { disabledModules: ["memory"] }, "only the old name");
  assert.deepEqual(parseProfile({ disabledModules: ["voice"] }), { disabledModules: ["voice"] }, "only the new name");
  assert.deepEqual(parseProfile({ disabledModules: ["voice"], disabledTools: ["voice"], v: 2 }), { disabledModules: ["voice"] }, "both");
  assert.deepEqual(parseProfile({ title: "x" }), { title: "x" }, "neither");
  assert.deepEqual(parseProfile({ disabledTools: ["nope"], title: "x" }), { title: "x" }, "an unknown module drops the switches only");
  assert.deepEqual(storedProfile({ disabledModules: ["memory"] }), { disabledModules: ["memory"], disabledTools: ["memory"], v: 2 }, "both written until v5");
  assert.deepEqual(storedProfile({ title: "x" }), { title: "x", v: 2 });
  assert.equal(storedProfile({}), null);
  assert.deepEqual(
    PROFILE_CHOICES.features.map((f) => f.value),
    OPTIONAL_MODULES.map((m) => m.id),
  );
  assert.deepEqual(
    PROFILE_CHOICES.quotas.map((q) => q.value),
    ["cost_usd", "searches", "images", "voices"],
  );
});

await test("settings: every module and provider group exists; provider choices list the providers", () => {
  const groups = new Set(SETTING_GROUPS.map((g) => g.id));
  for (const def of SETTINGS) assert.ok(groups.has(def.group), `${def.key} is in group ${def.group}`);
  for (const m of MODULES) {
    if (m.settings) assert.ok(groups.has(m.settings), `${m.id}'s group ${m.settings}`);
    for (const p of m.capability?.providers ?? []) {
      assert.ok(groups.has(p.settings), `${m.id}/${p.id}'s group ${p.settings}`);
      assert.equal(SETTING_GROUPS.find((g) => g.id === p.settings)!.provider?.id, p.id);
    }
    if (m.capability) {
      const choice = settingDef(m.capability.selectionSetting)!;
      assert.equal(choice.kind, "enum");
      assert.deepEqual(
        choice.options!.map((o) => o.value),
        ["", ...m.capability.providers.map((p) => p.id)],
      );
    }
  }
  assert.equal(new Set(SETTINGS.map((d) => d.key)).size, SETTINGS.length, "no key twice");
});

await test("settings files are pure data: no runtime imports (the catalog reads them, and config reads the catalog)", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === "settings.ts") files.push(p);
    }
  };
  walk(fileURLToPath(new URL("../src/modules", import.meta.url)));
  assert.ok(files.length >= 10);
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.startsWith("import ")) assert.ok(line.startsWith("import type "), `${file}: ${line}`);
    }
  }
});

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("all module tests passed");
