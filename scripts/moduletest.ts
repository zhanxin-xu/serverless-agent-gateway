/**
 * Modules, capabilities, the system prompt and the layers (docs/design/modules.md 10):
 * `npm test` runs it after selftest.ts. Offline: no service is called. The
 * gateway is composed as the Vercel deployment composes it.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Every optional module configured (fake values), as in a full deployment.
const FULL = {
  MODEL_OPENROUTER_API_KEY: "k",
  SEARCH_DEEPSEEK_API_KEY: "k",
  IMAGE_OPENROUTER_API_KEY: "k",
  VOICE_OPENROUTER_API_KEY: "k",
  UPSTASH_VECTOR_REST_URL: "https://vector.example.com",
  UPSTASH_VECTOR_REST_TOKEN: "k",
  SANDBOX_VERCEL_ENABLED: "1",
};
Object.assign(process.env, FULL);
for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "VERCEL", "VERCEL_OIDC_TOKEN"]) delete process.env[name];

(await import("../packages/vercel/src/composition.js")).composeVercel();
const { channel, providers } = await import("../packages/core/src/composition.js");
const { allModules, optionalModules, Toolset, checkModules, moduleOfTool, moduleStatus, activeModules } = await import("../packages/core/src/modules/registry.js");
const MODULES = allModules();
const OPTIONAL_MODULES = optionalModules();
const { select } = await import("../packages/core/src/modules/capability.js");
const { assemble } = await import("../packages/core/src/prompt/assemble.js");
const { interpolate } = await import("../packages/core/src/prompt/variables.js");
const { dafeiyu: persona } = await import("../packages/vercel/src/personas/dafeiyu/index.js");
const { prompt: PERSONA_PROMPT, examples: EXAMPLES } = persona;
const { RULES, SCENE_RULES } = await import("../packages/core/src/prompt/rules.js");
const { settingGroups, settingDefs, settingDef } = await import("../packages/core/src/settings/catalog.js");
const { ORDER } = await import("../packages/core/src/prompt/order.js");
const { parseProfile, profileChoices } = await import("../packages/core/src/chats/profile.js");
const { turnUsage, quotaPolicy } = await import("../packages/core/src/chats/usage.js");

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
  assemble({ chatType, channelHint: channel("qq")!.promptHint, toolset: new Toolset({ disabled: new Set(off) }) });

await test("every module is on when everything is configured", () => {
  assert.deepEqual(
    activeModules().map((m) => m.id),
    MODULES.map((m) => m.id),
  );
});

await test("the persona, the rules and the scenes name no tools", () => {
  for (const [where, text] of [["persona", PERSONA_PROMPT], ["rules", RULES], ["private", SCENE_RULES.private], ["group", SCENE_RULES.group]]) {
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

await test("the chat model: one provider per endpoint, each with its own key; the one in use is chosen", async () => {
  const model = MODULES.find((m) => m.id === "model")!;
  const { currentModelIdentity } = await import("../packages/core/src/modules/model/capability.js");
  assert.deepEqual(
    model.capability!.providers.map((p) => p.id),
    ["openrouter", "openai", "anthropic", "gemini", "deepseek", "custom"],
  );
  assert.equal(currentModelIdentity()!.provider, "https://openrouter.ai/api/v1", "only OpenRouter has a key: it's used");
  await withEnv({ MODEL_ANTHROPIC_API_KEY: "ak", MODEL_ANTHROPIC_MODEL: "claude-x" }, async () => {
    const status = moduleStatus(model);
    assert.ok(!status.ok && /有 2 个可用的聊天模型（OpenRouter、Anthropic），请在配置页选一个/.test(status.reason), JSON.stringify(status));
    await withEnv({ MODEL_PROVIDER: "anthropic" }, () => {
      assert.deepEqual(currentModelIdentity(), { api: "anthropic-messages", provider: "https://api.anthropic.com", model: "claude-x" });
      assert.equal(process.env.MODEL_OPENROUTER_API_KEY, "k", "switching keeps the other instance's settings");
    });
  });
  await withEnv({ MODEL_CUSTOM_API_KEY: "ck", MODEL_CUSTOM_MODEL: "m", MODEL_PROVIDER: "custom" }, () => {
    const status = moduleStatus(model);
    assert.ok(!status.ok && /还没填 自定义 的服务地址/.test(status.reason), "a custom endpoint needs its URL");
  });
});

await test("a module whose requirement is off is off too, saying why", async () => {
  await withEnv({ SANDBOX_VERCEL_ENABLED: "0" }, () => {
    const image = MODULES.find((m) => m.id === "image")!;
    const status = moduleStatus(image);
    assert.equal(status.ok, false);
    assert.match((status as { reason: string }).reason, /需要先开启沙盒/);
    assert.ok(!new Toolset().has("generate_image"));
  });
  // A chat turning the sandbox off turns its images off too.
  assert.ok(!new Toolset({ disabled: new Set(["sandbox"]) }).has("generate_image"));
});

await test("an optional module's switch turns it off everywhere, and what requires it with it", async () => {
  for (const m of OPTIONAL_MODULES) {
    const def = settingDef(`MODULE_${m.id.toUpperCase()}`)!;
    assert.ok(def, `${m.id} has a switch`);
    assert.equal(def.default, "on");
    assert.equal(def.group, m.config!.group.id);
  }
  await withEnv({ MODULE_SEARCH: "off" }, () => {
    const search = MODULES.find((m) => m.id === "search")!;
    assert.deepEqual(moduleStatus(search), { ok: false, reason: "已关闭" });
    assert.ok(!new Toolset().has("web_search"));
    assert.ok(!prompt("group").prompt.includes("web_search"));
  });
  await withEnv({ MODULE_SANDBOX: "off" }, () => {
    assert.match((moduleStatus(MODULES.find((m) => m.id === "image")!) as { reason: string }).reason, /需要先开启沙盒（已关闭）/);
  });
  assert.equal(settingDef("MODULE_CHAT"), undefined, "core modules have no switch");
});

await test("choosing a provider: chosen, automatic, missing, unconfigured, none, several", async () => {
  const provider = (id: string, ok: boolean) => ({
    id,
    capability: "t",
    config: { group: { id: `t.${id}`, label: id.toUpperCase(), help: "" }, settings: [] },
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
  assert.match(voice(), /现在是 Fish 模型：可在 `text` 里用 `\[得意地\]`/);
  await withEnv({ VOICE_OPENROUTER_MODEL: "bytedance-seed/seed-audio-1.0" }, () => {
    assert.match(voice(), /现在是 Seed 模型/);
    assert.doesNotMatch(voice(), /\[得意地\]/, "Seed gets no inline tags");
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

await test("a chat's switches: disabledModules, module ids only", () => {
  assert.deepEqual(parseProfile({ disabledModules: ["voice"] }), { disabledModules: ["voice"] });
  assert.deepEqual(parseProfile({ title: "x" }), { title: "x" });
  assert.deepEqual(parseProfile({ disabledModules: ["nope"], title: "x" }), { title: "x" }, "an unknown module drops the switches only");
  assert.deepEqual(
    profileChoices().features.map((f) => f.value),
    OPTIONAL_MODULES.map((m) => m.id),
  );
  assert.deepEqual(
    profileChoices().quotas.map((q) => q.value),
    ["cost_usd", "searches", "images", "voices"],
  );
});

await test("settings: each module brings its own, the catalog collects them, switches and provider choices included", () => {
  const groups = settingGroups();
  const ids = new Set(groups.map((g) => g.id));
  for (const def of settingDefs()) assert.ok(ids.has(def.group), `${def.key} is in group ${def.group}`);
  for (const m of MODULES) {
    if (m.config) assert.equal(groups.find((g) => g.id === m.config!.group.id)!.module, m.id, `${m.id}'s group is tagged with it`);
    for (const p of m.capability?.providers ?? []) {
      const g = groups.find((x) => x.id === p.config.group.id)!;
      assert.deepEqual([g.module, g.provider], [m.id, { capability: m.capability!.id, id: p.id }]);
    }
    if (m.capability) assert.ok(m.capability.providers.length, `the composition gives ${m.capability.id} a provider`);
  }
  // Every composed provider implements a loaded module's capability (compose() refuses one that doesn't),
  // so looking by module finds every implementation, whichever vendor's folder it is in.
  const capabilities = new Set(MODULES.flatMap((m) => (m.capability ? [m.capability.id] : [])));
  for (const p of providers()) assert.ok(capabilities.has(p.capability), `provider ${p.id} implements ${p.capability}`);
  for (const m of MODULES) {
    if (m.capability) {
      const choice = settingDef(m.capability.selectionSetting)!;
      assert.equal(choice.kind, "enum");
      assert.deepEqual(
        choice.options!.map((o) => o.value),
        m.capability.providers.map((p) => p.id),
      );
    }
  }
  assert.equal(new Set(settingDefs().map((d) => d.key)).size, settingDefs().length, "no key twice");
  assert.equal(groups.find((g) => g.id === "llm")!.module, "model", "the model module's own settings (which provider, the call timeout)");
  assert.equal(settingDef("MODEL_OPENROUTER_API_KEY")!.group, "model.openrouter", "the endpoint, key and model come with the provider instance");
  assert.deepEqual(groups.find((g) => g.id === "model.openrouter")!.provider, { capability: "chat-model", id: "openrouter" });
  assert.equal(settingDef("MODEL_ANTHROPIC_API_KEY")!.group, "model.anthropic", "each instance has its own key");
  assert.equal(settingDef("IMAGE_OPENROUTER_API_KEY")!.group, "image.openrouter", "the same vendor in another module: another key");
  assert.equal(settingDef("STICKER_BASE_URL")!.group, "chat", "the sticker CDN comes with the chat module");
  assert.equal(groups.find((g) => g.id === "qq")!.channel, "qq", "a channel's settings come with its adapter");
  assert.equal(settingDef("WORKER_SECRET"), undefined, "a hand-over needs no secret: the run's lock is the ticket");
  assert.equal(settingDef("IMAGE_SELF_REFERENCE")!.default, persona.picture, "defaults about her come from the composed persona");
});

await test("a module's definition is checked when the modules load", () => {
  const base = MODULES.find((m) => m.id === "search")!;
  const bad = (change: object) => [...MODULES.filter((m) => m !== base), { ...base, ...change }];
  assert.doesNotThrow(() => checkModules(MODULES));
  assert.throws(() => checkModules([...MODULES, base]), /two modules are called search/);
  assert.throws(() => checkModules(bad({ id: "Search!" })), /lowercase letters and digits/);
  assert.throws(() => checkModules(bad({ section: { order: 5000, text: () => "" } })), /chat and search both put their section at 5000/);
  assert.throws(() => checkModules(bad({ section: { order: 100, text: () => "" } })), /outside 5000–7999/);
  assert.throws(() => checkModules(bad({ requires: ["nope"] })), /requires nope, which isn't loaded/);
  assert.throws(() => checkModules(bad({ meter: { key: "images", label: "x", tools: ["web_search"] } })), /both count into images/);
  assert.throws(() => checkModules(bad({ meter: { key: "x", label: "x", tools: ["bash"] } })), /meters bash, which isn't its tool/);
  assert.throws(() => checkModules(bad({ core: true })), /core module search depends on a service: the setup guide must ask for it/);
  assert.throws(() => checkModules(bad({ tools: [...base.tools, MODULES[0]!.tools[0]!] })), /tool send_message is in both chat and search/);
  for (const m of MODULES) if (m.section) assert.ok(m.section.order >= ORDER.modules.from && m.section.order <= ORDER.modules.to);
});

await test("the persona lives in the deployment: nothing in the core or the adapters names her, or anything about her", () => {
  const banned = [persona.name, "dafeiyu", "鲸鱼", "whale", "白饭", "小本本"];
  for (const file of [...sourceFiles("packages/core/src"), ...sourceFiles("packages/adapters/src")]) {
    const text = readFileSync(file, "utf8");
    for (const word of banned) assert.ok(!text.includes(word), `${path.relative(process.cwd(), file)} mentions ${word}`);
  }
});

await test("the persona's examples follow the modules: an example shows only while its module is on", () => {
  for (const id of Object.keys(EXAMPLES)) assert.ok(MODULES.some((m) => m.id === id), `examples for ${id}, which isn't a module`);
  const examples = (off: string[]) => prompt("group", off).sections.find((s) => s.name === "examples")?.text ?? "";
  assert.match(examples([]), /send_voice/);
  assert.match(examples([]), /remember\(/);
  assert.doesNotMatch(examples(["voice"]), /send_voice/);
  assert.doesNotMatch(examples(["memory"]), /remember\(/);
  assert.match(examples(["voice", "memory"]), /send_sticker/, "the chat module's stay");
});

await test("modules reach each other only through each other's index.ts (like dsh's injected services)", () => {
  const root = fileURLToPath(new URL("../packages/core/src/modules", import.meta.url));
  const modules = new Set(MODULES.map((m) => m.id));
  for (const file of sourceFiles("packages/core/src/modules")) {
    const own = path.relative(root, file).split(path.sep)[0]!;
    if (!modules.has(own)) continue;
    for (const [, spec] of readFileSync(file, "utf8").matchAll(/from "(\.[^"]+)"/g)) {
      const target = path.relative(root, path.resolve(path.dirname(file), spec!));
      const [other, ...rest] = target.split(path.sep);
      if (!modules.has(other!) || other === own) continue;
      assert.equal(rest.join("/"), "index.js", `${path.relative(root, file)} imports ${target}: use ${other}/index.ts`);
      assert.ok(MODULES.find((m) => m.id === own)!.requires?.includes(other!), `${own} imports ${other} without requiring it`);
    }
    // The registry and the catalog sit above the modules: a module never reads them.
    for (const [, spec] of readFileSync(file, "utf8").matchAll(/from "(\.[^"]+)"/g)) {
      const target = path.resolve(path.dirname(file), spec!);
      assert.ok(!/modules\/registry\.js$|settings\/catalog\.js$/.test(target) || /import type/.test(readFileSync(file, "utf8").split("\n").find((l) => l.includes(spec!))!), `${path.relative(root, file)} imports ${spec}`);
    }
  }
});

/**
 * The packages (Composition in packages/core/src/composition.ts):
 *   core       names no adapter, persona or deployment; nothing outside its own src/
 *   adapters   use the core's public entry only; a vendor's folder reaches no other vendor's
 *   vercel     uses the core's public entry and the adapters' vendor entries; its persona is data
 * And every npm package a file imports is declared by its own package, so each
 * one installs and builds on its own.
 */
await test("packages: core ← adapters ← vercel, each through public entries, each with its own dependencies", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");
  const specs = (file: string) => [...readFileSync(file, "utf8").matchAll(/(?:from|import\() *"([^"]+)"/g)].map(([, spec]) => spec!);
  const manifest = (pkg: string) => JSON.parse(readFileSync(path.join(root, "packages", pkg, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  const npmName = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!);
  for (const pkg of ["core", "adapters", "vercel"]) {
    const deps = new Set(Object.keys(manifest(pkg).dependencies ?? {}));
    const dirs = pkg === "vercel" ? ["src", "api", "scripts"] : ["src"];
    for (const file of dirs.flatMap((d) => sourceFiles(`packages/${pkg}/${d}`))) {
      const from = rel(file);
      for (const spec of specs(file)) {
        if (spec.startsWith(".")) {
          const target = rel(path.resolve(path.dirname(file), spec));
          assert.ok(target.startsWith(`packages/${pkg}/`), `${from} imports ${target}: another package is reached by its name, not a path`);
          if (pkg === "adapters") {
            const vendor = from.split("/").slice(0, 4).join("/");
            assert.ok(target.startsWith(`${vendor}/`), `${from} imports ${target}: a vendor's folder reaches no other vendor's`);
          }
          if (/^packages\/vercel\/src\/personas\//.test(from)) {
            assert.ok(target.startsWith(from.split("/").slice(0, 5).join("/") + "/"), `${from} imports ${target}: a persona is data`);
          }
          if (/^packages\/vercel\/api\//.test(from)) assert.equal(target, "packages/vercel/src/index.js", `${from}: api/ only hands over to src/index.ts`);
          continue;
        }
        if (spec.startsWith("node:")) continue;
        if (pkg === "core") assert.ok(!spec.startsWith("@gateway/"), `${from} imports ${spec}: the core names no adapter or deployment`);
        if (pkg === "adapters") assert.ok(!spec.startsWith("@gateway/") || spec === "@gateway/core", `${from} imports ${spec}`);
        assert.ok(deps.has(npmName(spec)), `${from} imports ${spec}, which packages/${pkg}/package.json doesn't declare`);
      }
    }
  }
  // Only the host may know where it runs.
  for (const file of sourceFiles("packages/core/src")) {
    assert.ok(!readFileSync(file, "utf8").includes("@vercel/functions"), `${rel(file)} uses @vercel/functions: that's the Vercel host's`);
  }
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".ts")) out.push(p);
    }
  };
  const start = fileURLToPath(new URL(`../${dir}`, import.meta.url));
  if (existsSync(start)) walk(start);
  return out;
}

// Last: it replaces the composition the tests above use.
await test("compose() refuses a provider no loaded module uses, or two with one id", async () => {
  const { compose } = await import("../packages/core/src/composition.js");
  const { searchModule } = await import("../packages/core/src/modules/index.js");
  const { deepseekProvider } = await import("../packages/adapters/src/deepseek/index.js");
  const { upstashVectorProvider } = await import("../packages/adapters/src/upstash-vector/index.js");
  const { MemoryStore } = await import("../packages/core/src/store/index.js");
  const base = { baseDir: "/", host: { id: "t", background() {}, runBudgetMs: () => 1 }, persona, channels: [], store: () => new MemoryStore(), guide: { password: [], changePassword: "", database: { intro: "", steps: [] } } };
  assert.throws(() => compose({ ...base, modules: [searchModule], providers: [deepseekProvider, upstashVectorProvider] }), /upstash implements vector-memory, which no loaded module uses/);
  assert.throws(() => compose({ ...base, modules: [searchModule], providers: [deepseekProvider, deepseekProvider] }), /two search providers are called deepseek/);
});

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("all module tests passed");
