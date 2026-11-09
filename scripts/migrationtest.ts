/**
 * The schema's data migrations against a real Postgres: `npm run test:store`
 * (with TEST_DATABASE_URL, a database you can throw away; skipped without).
 *
 * Version 6: a database holding a chat written before it (Responses API output
 * items, the model's settings under their old names) is upgraded the way the
 * console does it: schema.sql, then gateway.migrate_events_v6 with the model's
 * identity. The chat must then read back as the same requests: the reasoning
 * item sent back whole, the calls paired with their outputs.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";
import { responsesStream } from "./fake-llm.js";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("- [migration] skipped: set TEST_DATABASE_URL to run against a real Postgres");
  process.exit(0);
}

for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "VERCEL", "VERCEL_OIDC_TOKEN"]) delete process.env[name];
Object.assign(process.env, { MODEL_API_KEY: "k", MODEL_BASE_URL: "https://openrouter.ai/api/v1", MODEL_ID: "openai/gpt-x" });
(await import("../packages/vercel/src/composition.js")).composeVercel();
const { deriveMessages } = await import("../packages/core/src/conversation/derive.js");
const { piAiChatModel } = await import("../packages/adapters/src/pi-ai/index.js");

const SCHEMA = fs.readFileSync(new URL("../packages/adapters/src/supabase/schema.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query("set client_min_messages = warning");
const one = async <T>(sql: string, values: unknown[] = []): Promise<T> => (await client.query(sql, values)).rows[0] as T;

// Responses API items as the model returned them before version 6.
const reasoning = { type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "先查" }], encrypted_content: "ENC" };
const call = { type: "function_call", id: "fc_1", call_id: "call_1", name: "web_search", arguments: '{"query":"天气"}' };
const brokenCall = { type: "function_call", id: "fc_2", call_id: "call_2", name: "send_message", arguments: "{not json" };
const message = { type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "晴", annotations: [] }] };
const usage = { input_tokens: 1000, input_tokens_details: { cached_tokens: 800 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 }, cost: 0.002 };

let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ [migration] ${name}`);
  } catch (err) {
    failed++;
    console.log(`✗ [migration] ${name}\n`, err);
  }
}

await test("a fresh database is version 6 at once", async () => {
  await client.query("drop schema if exists gateway cascade");
  await client.query(SCHEMA);
  assert.deepEqual(await one("select public.gateway_info() as i"), { i: { schemaVersion: 6, legacyEvents: false } });
});

await test("an older database: schema.sql renames the settings and waits for the events' migration", async () => {
  await client.query("insert into gateway.sessions (chat, channel, conversation_id, next_seq) values ('qq:c2c:U', 'qq', 'c2c:U', 9)");
  const events: Array<[number, string, unknown]> = [
    [0, "user/message", { eventId: "m0", header: "h", text: "天气", sender: "老王", mentioned: true, reply: {} }],
    [1, "turn/start", { turn: 1, trigger: "direct" }],
    [2, "assistant/message", { turn: 1, step: 1, output: [reasoning, call], usage }],
    [3, "tool/call", { turn: 1, step: 1, callId: "call_1", name: "web_search" }],
    [4, "tool/result", { turn: 1, step: 1, callId: "call_1", output: "晴天" }],
    [5, "assistant/message", { turn: 1, step: 2, output: [message, brokenCall] }],
    [6, "tool/result", { turn: 1, step: 2, callId: "call_2", output: "Error: bad arguments" }],
    [7, "turn/end", { turn: 1, reason: "completed" }],
    [8, "compaction/summary", { fromSeq: 0, summary: "之前聊过天气", usage: { input_tokens: 10, output_tokens: 2 } }],
  ];
  for (const [seq, type, data] of events) {
    await client.query("insert into gateway.events (chat, seq, type, time, data) values ('qq:c2c:U', $1, $2, to_timestamp($3), $4)", [seq, type, 1_700_000_000 + seq, data]);
  }
  await client.query("update gateway.meta set value = '5' where key = 'schema_version'");
  await client.query("insert into gateway.settings (key, value) values ('OPENAI_RESPONSES_MODEL', 'openai/gpt-x'), ('OPENAI_RESPONSES_EXTRA_BODY', '{\"a\":1}'), ('MODEL_EXTRA_BODY', '{\"b\":2}')");

  await client.query(SCHEMA);
  assert.deepEqual(await one("select public.gateway_info() as i"), { i: { schemaVersion: 5, legacyEvents: true } }, "not marked 6 while events wait");
  const settings = (await client.query("select key, value from gateway.settings order by key")).rows;
  assert.deepEqual(settings, [
    { key: "MODEL_EXTRA_BODY", value: '{"b":2}' },
    { key: "MODEL_ID", value: "openai/gpt-x" },
  ], "renamed; a value already under the new name wins");
});

await test("migrate_events_v6: blocks as pi-ai reads them, tool call ids as pi-ai writes them, usage, version 6", async () => {
  const counts = await one<{ r: unknown }>("select gateway.migrate_events_v6('openai-responses', 'https://openrouter.ai/api/v1', 'openai/gpt-x') as r");
  assert.deepEqual(counts.r, { messages: 2, toolEvents: 3, summaries: 1 }, "two calls' marker and results renamed");
  const rows = (await client.query("select seq, type, data from gateway.events where chat = 'qq:c2c:U' order by seq")).rows;
  const first = rows[2].data.message;
  assert.deepEqual(first.content, [
    { type: "thinking", thinking: "先查", thinkingSignature: first.content[0].thinkingSignature },
    { type: "toolCall", id: "call_1|fc_1", name: "web_search", arguments: { query: "天气" } },
  ]);
  assert.deepEqual(JSON.parse(first.content[0].thinkingSignature), reasoning, "the reasoning item, whole");
  assert.deepEqual([first.api, first.provider, first.model, first.stopReason, first.timestamp], ["openai-responses", "https://openrouter.ai/api/v1", "openai/gpt-x", "toolUse", 1_700_000_002_000]);
  assert.deepEqual(first.usage, {
    input: 200, output: 20, cacheRead: 800, cacheWrite: 0, reasoning: 5, totalTokens: 1020,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.002, totalFromProvider: true },
  });
  assert.deepEqual([rows[3].data.callId, rows[4].data.callId, rows[6].data.callId], ["call_1|fc_1", "call_1|fc_1", "call_2|fc_2"]);
  const second = rows[5].data.message;
  assert.deepEqual(second.content[0], { type: "text", text: "晴", textSignature: '{"v": 1, "id": "msg_1"}' });
  assert.deepEqual(second.content[1].arguments, {}, "arguments that weren't JSON become {}");
  assert.equal(second.usage.cost.total, 0, "no usage recorded: zero");
  assert.equal(rows[8].data.usage.input, 10);
  assert.deepEqual(await one("select public.gateway_info() as i"), { i: { schemaVersion: 6, legacyEvents: false } });

  await client.query(SCHEMA);
  assert.deepEqual(await one("select public.gateway_info() as i"), { i: { schemaVersion: 6, legacyEvents: false } }, "running schema.sql again changes nothing");
});

await test("the migrated chat reads back as the same requests: reasoning whole, calls paired with their outputs", async () => {
  const rows = (await client.query("select seq, type, extract(epoch from time) * 1000 as time, data from gateway.events where chat = 'qq:c2c:U' order by seq")).rows;
  const events = rows.map((r) => ({ seq: Number(r.seq), type: r.type, time: Number(r.time), data: r.data }));
  const messages = await deriveMessages(events, async () => null);
  let body: any;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(await new Request(input, init).text());
    return responsesStream([{ type: "message", id: "msg_9", role: "assistant", status: "completed", content: [{ type: "output_text", text: "好", annotations: [] }] }], { input_tokens: 1, output_tokens: 1, total_tokens: 2 });
  }) as typeof fetch;
  await piAiChatModel().create().complete({ systemPrompt: "S", messages, tools: [], toolChoice: "none", timeoutMs: 5_000 });
  const items = body.input.filter((i: any) => i.type);
  assert.deepEqual(items[0], reasoning, "sent back exactly as the model returned it");
  assert.deepEqual(items[1], call);
  assert.deepEqual(items[2], { type: "function_call_output", call_id: "call_1", output: "晴天" });
  assert.deepEqual(items[3], { type: "message", role: "assistant", content: [{ type: "output_text", text: "晴", annotations: [] }], status: "completed", id: "msg_1" });
  assert.deepEqual([items[4].call_id, items[5]], ["call_2", { type: "function_call_output", call_id: "call_2", output: "Error: bad arguments" }]);
});

await test("the console's upgrade (Database.apply) runs schema.sql, then the migration with the model's identity now", async () => {
  await client.query("insert into gateway.events (chat, seq, type, data) values ('qq:c2c:U', 9, 'assistant/message', $1)", [{ turn: 2, step: 1, output: [message] }]);
  await client.query("update gateway.meta set value = '5' where key = 'schema_version'");
  process.env.DATABASE_URL = url;
  try {
    const { supabaseDatabase } = await import("../packages/adapters/src/supabase/index.js");
    await supabaseDatabase.apply();
  } finally {
    delete process.env.DATABASE_URL;
  }
  assert.deepEqual(await one("select public.gateway_info() as i"), { i: { schemaVersion: 6, legacyEvents: false } });
  const { data } = await one<{ data: any }>("select data from gateway.events where chat = 'qq:c2c:U' and seq = 9");
  assert.deepEqual([data.message.api, data.message.provider, data.message.model], ["openai-responses", "https://openrouter.ai/api/v1", "openai/gpt-x"]);
});

await client.end();
if (failed) {
  console.error(`${failed} migration tests failed`);
  process.exit(1);
}
console.log("all migration tests passed");
