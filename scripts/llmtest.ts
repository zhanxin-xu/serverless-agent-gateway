/**
 * The chat model over each protocol, through pi-ai's real clients against a
 * fake server speaking that protocol's stream: `npm test` runs it. For each:
 * where the system prompt, tools and tool choice go; the extra body; what
 * comes back (reasoning with its replay data, tool calls, usage); that the
 * replay data goes back whole to the same model and not to another; and how
 * failures are classified. selftest.ts runs the whole gateway on the Responses API.
 */
import assert from "node:assert/strict";
import { anthropicStream, completionsStream, geminiStream, responsesStream } from "./fake-llm.js";

for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "VERCEL", "VERCEL_OIDC_TOKEN"]) delete process.env[name];
(await import("../packages/vercel/src/composition.js")).composeVercel();
const { piAiChatModel } = await import("../packages/adapters/src/pi-ai/index.js");
const { ModelCallError, OutOfCreditError } = await import("../packages/core/src/llm/errors.js");
type AssistantMessage = import("../packages/core/src/llm/types.js").AssistantMessage;
type Message = import("../packages/core/src/llm/types.js").Message;
type ToolChoice = import("../packages/core/src/llm/types.js").ToolChoice;

// An instance of its own (its settings MODEL_TEST_…), whatever the deployment composes.
const model = piAiChatModel({ id: "test", label: "Test", help: "", api: "openai-responses", baseUrl: "" }).create();

interface Seen {
  url: string;
  headers: Headers;
  body: any;
  signal: AbortSignal;
}
let seen: Seen[] = [];
let reply: (req: Seen) => Response = () => {
  throw new Error("no reply set");
};
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const req = new Request(input, init);
  const text = await req.text();
  const entry = { url: req.url, headers: req.headers, body: text ? JSON.parse(text) : undefined, signal: req.signal };
  seen.push(entry);
  return reply(entry);
}) as typeof fetch;

/** The test instance's settings: protocol, endpoint, model, and any others by field (EXTRA_BODY, PRICE_INPUT…). */
function configure(api: string, baseUrl: string, model: string, extra: Record<string, string> = {}) {
  for (const key of Object.keys(process.env)) if (key.startsWith("MODEL_TEST_")) delete process.env[key];
  const fields = { API: api, BASE_URL: baseUrl, MODEL: model, API_KEY: "test-key", ...extra };
  for (const [field, value] of Object.entries(fields)) process.env[`MODEL_TEST_${field}`] = value;
  seen = [];
}

const TOOLS = [
  { name: "send_message", description: "Send a message.", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
  { name: "end_turn", description: "End the turn.", parameters: { type: "object", properties: {} } },
];
const user = (text: string): Message => ({ role: "user", content: text, timestamp: 1 });
const result = (call: { id: string; name: string }, output: string): Message => ({
  role: "toolResult",
  toolCallId: call.id,
  toolName: call.name,
  content: [{ type: "text", text: output }],
  isError: false,
  timestamp: 2,
});
const complete = (messages: Message[], toolChoice: ToolChoice = "required") =>
  model.complete({ systemPrompt: "SYS", messages, tools: TOOLS, toolChoice, cacheKey: "0123456789abcdef0123456789abcdef", timeoutMs: 5_000 });
const callOf = (m: AssistantMessage) => m.content.find((b) => b.type === "toolCall") as { id: string; name: string; arguments: Record<string, unknown> };

let failed = 0;
let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${name}\n`, err);
  }
}

// ── OpenAI Responses ──

const RESPONSES_USAGE = { input_tokens: 100, input_tokens_details: { cached_tokens: 60 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 8 }, total_tokens: 120 };
const reasoning = { type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "想想" }], encrypted_content: "ENC" };
const fnCall = { type: "function_call", id: "fc_1", call_id: "call_1", name: "send_message", arguments: '{"text":"hi"}' };

await test("responses: tool choice forms, the extra body, the identity", async () => {
  configure("openai-responses", "https://or.example.com/api/v1", "openai/gpt-x", { EXTRA_BODY: '{"reasoning":{"effort":"high"},"include":["x"]}' });
  reply = () => responsesStream([reasoning, fnCall], RESPONSES_USAGE);
  await complete([user("hi")], { tool: "send_message" });
  await complete([user("hi")], "none");
  const [forced, none] = seen.map((s) => s.body);
  assert.equal(seen[0]!.url, "https://or.example.com/api/v1/responses");
  assert.deepEqual(forced.tool_choice, { type: "function", name: "send_message" });
  assert.equal(none.tool_choice, "none");
  assert.deepEqual(forced.reasoning, { effort: "high" }, "the extra body's reasoning, not pi-ai's");
  assert.deepEqual(forced.include, ["x", "reasoning.encrypted_content"], "the extra include kept, the encrypted reasoning always asked for");
  assert.deepEqual(model.identity(), { api: "openai-responses", provider: "https://or.example.com/api/v1", model: "openai/gpt-x" });
});

await test("responses: the reasoning item goes back whole to the same model, not to another", async () => {
  configure("openai-responses", "https://or.example.com/api/v1", "openai/gpt-x");
  reply = () => responsesStream([reasoning, fnCall], RESPONSES_USAGE);
  const first = await complete([user("hi")]);
  assert.deepEqual(first.content[0], { type: "thinking", thinking: "想想", thinkingSignature: JSON.stringify(reasoning) });
  assert.equal(callOf(first).id, "call_1|fc_1");
  assert.deepEqual(first.usage.cacheRead, 60);
  assert.equal(first.usage.input, 40, "input excludes the cached tokens");
  const next = [user("hi"), first, result(callOf(first), "sent")];
  await complete(next);
  assert.deepEqual(seen[1]!.body.input.slice(2, 5), [reasoning, fnCall, { type: "function_call_output", call_id: "call_1", output: "sent" }]);

  configure("openai-responses", "https://or.example.com/api/v1", "openai/another");
  reply = () => responsesStream([fnCall], RESPONSES_USAGE);
  await complete(next);
  const input = seen[0]!.body.input;
  assert.ok(!input.some((i: any) => i.type === "reasoning"), "another model gets no reasoning item");
  const call = input.find((i: any) => i.type === "function_call");
  assert.equal(call.name, "send_message", "the call itself is kept");
  assert.ok(input.some((i: any) => i.type === "function_call_output" && i.call_id === call.call_id), "still paired with its output");
});

await test("responses: failures are classified (rate limit and 5xx transient, credit and bad request not)", async () => {
  configure("openai-responses", "https://or.example.com/api/v1", "openai/gpt-x");
  const fail = async (status: number, message: string) => {
    reply = () => Response.json({ error: { message, code: status } }, { status });
    return complete([user("hi")]).then(
      () => assert.fail("expected a failure"),
      (err: unknown) => err as InstanceType<typeof ModelCallError>,
    );
  };
  const limited = await fail(429, "Rate limit exceeded");
  assert.ok(limited instanceof ModelCallError && limited.transient);
  const down = await fail(503, "upstream unavailable");
  assert.ok(down.transient);
  const broke = await fail(402, "Insufficient credits");
  assert.ok(broke instanceof OutOfCreditError && !broke.transient);
  const bad = await fail(400, "invalid tool schema");
  assert.ok(!(bad instanceof OutOfCreditError) && !bad.transient);
  process.env.MODEL_TEST_EXTRA_BODY = '{"tools":[]}';
  await assert.rejects(complete([user("hi")]), (err: any) => err instanceof ModelCallError && !err.transient && /MODEL_TEST_EXTRA_BODY 不能设置 tools/.test(err.message));
});

await test("responses: a call that outlasts its time is a transient failure", async () => {
  configure("openai-responses", "https://or.example.com/api/v1", "openai/gpt-x");
  // A server that never answers; the call's abort signal ends the stream, as it does a real fetch.
  reply = (req) =>
    new Response(
      new ReadableStream({
        start(controller) {
          req.signal.addEventListener("abort", () => controller.error(req.signal.reason));
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  // AbortSignal.timeout doesn't keep the process alive (a real request's socket does).
  const alive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(
      model.complete({ systemPrompt: "SYS", messages: [user("hi")], tools: TOOLS, toolChoice: "required", timeoutMs: 200 }),
      (err: any) => err instanceof ModelCallError && err.transient && /no response within/.test(err.message),
    );
  } finally {
    clearInterval(alive);
  }
});

// ── OpenAI Chat Completions ──

await test("completions: system message, tools and tool choice; DeepSeek's reasoning_content goes back with its call", async () => {
  configure("openai-completions", "https://api.deepseek.com", "deepseek-chat", { EXTRA_BODY: '{"thinking":{"type":"enabled"}}' });
  reply = () =>
    completionsStream(
      { reasoning: { field: "reasoning_content", text: "先想" }, toolCalls: [{ id: "call_9", name: "send_message", arguments: '{"text":"hi"}' }] },
      { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60, prompt_tokens_details: { cached_tokens: 30 } },
    );
  const first = await complete([user("hi")]);
  const req = seen[0]!;
  assert.equal(req.url, "https://api.deepseek.com/chat/completions");
  assert.equal(req.body.messages[0].content, "SYS");
  assert.equal(req.body.tool_choice, "required");
  assert.deepEqual(req.body.thinking, { type: "enabled" }, "extra body merged");
  assert.deepEqual(req.body.tools.map((t: any) => t.function.name), ["send_message", "end_turn"]);
  assert.deepEqual(first.content[0], { type: "thinking", thinking: "先想", thinkingSignature: "reasoning_content" });
  assert.deepEqual(callOf(first).arguments, { text: "hi" });
  assert.equal(first.usage.cacheRead, 30);

  await complete([user("hi"), first, result(callOf(first), "sent")], { tool: "send_message" });
  const next = seen[1]!.body;
  assert.deepEqual(next.tool_choice, { type: "function", function: { name: "send_message" } });
  const assistant = next.messages.find((m: any) => m.role === "assistant");
  assert.equal(assistant.reasoning_content, "先想", "the reasoning goes back with the call");
  assert.equal(assistant.tool_calls[0].id, "call_9");
  assert.deepEqual(next.messages.at(-1), { role: "tool", content: "sent", tool_call_id: "call_9" });
});

await test("completions: OpenRouter's reasoning_details go back whole", async () => {
  configure("openai-completions", "https://openrouter.ai/api/v1", "anthropic/claude-x");
  const details = [{ type: "reasoning.encrypted", data: "OPAQUE", id: "r1", format: "anthropic-claude-v1", index: 0 }];
  reply = () =>
    completionsStream(
      { reasoningDetails: details, toolCalls: [{ id: "toolu_1", name: "send_message", arguments: '{"text":"hi"}' }] },
      { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
    );
  const first = await complete([user("hi")]);
  await complete([user("hi"), first, result(callOf(first), "sent")]);
  const assistant = seen[1]!.body.messages.find((m: any) => m.role === "assistant");
  assert.deepEqual(assistant.reasoning_details, details);
});

// ── Anthropic Messages ──

await test("anthropic: system and tools cached, no forced tool (thinking stays on), the default output cap", async () => {
  configure("anthropic-messages", "https://api.anthropic.example", "claude-x", { EXTRA_BODY: '{"thinking":{"type":"adaptive"}}' });
  reply = () => anthropicStream([{ type: "text", text: "你好" }], { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 0 });
  const plain = await complete([user("hi")], { tool: "send_message" });
  await complete([user("hi")], "none");
  const [forced, none] = seen.map((s) => s.body);
  assert.match(seen[0]!.url, /^https:\/\/api\.anthropic\.example\/v1\/messages(\?beta=true)?$/, "the SDK adds /v1/messages to the base URL");
  assert.equal(forced.tool_choice, undefined, "asked, not forced");
  assert.deepEqual(none.tool_choice, { type: "none" });
  assert.deepEqual(forced.thinking, { type: "adaptive" });
  assert.equal(forced.max_tokens, 32_000);
  assert.ok(forced.system.at(-1).cache_control, "the system prompt is a cache breakpoint");
  assert.ok(forced.tools.at(-1).cache_control, "so are the tools");
  assert.equal(plain.stopReason, "stop");
  assert.equal(plain.content[0]!.type, "text");
});

await test("anthropic: thinking (signed and redacted) goes back unchanged with its tool call", async () => {
  configure("anthropic-messages", "https://api.anthropic.example", "claude-x");
  reply = () =>
    anthropicStream(
      [
        { type: "thinking", thinking: "想", signature: "SIG" },
        { type: "redacted_thinking", data: "REDACTED" },
        { type: "tool_use", id: "toolu_1", name: "send_message", input: { text: "hi" } },
      ],
      { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 5, cache_creation_input_tokens: 2 },
    );
  const first = await complete([user("hi")]);
  assert.deepEqual(first.content.slice(0, 2), [
    { type: "thinking", thinking: "想", thinkingSignature: "SIG" },
    { type: "thinking", thinking: "[Reasoning redacted]", thinkingSignature: "REDACTED", redacted: true },
  ]);
  assert.deepEqual([first.usage.cacheRead, first.usage.cacheWrite], [5, 2]);
  await complete([user("hi"), first, result(callOf(first), "sent")]);
  const messages = seen[1]!.body.messages;
  assert.deepEqual(messages[1].content.slice(0, 3), [
    { type: "thinking", thinking: "想", signature: "SIG" },
    { type: "redacted_thinking", data: "REDACTED" },
    { type: "tool_use", id: "toolu_1", name: "send_message", input: { text: "hi" } },
  ]);
  assert.equal(messages[2].content[0].type, "tool_result");
  assert.equal(messages[2].content[0].tool_use_id, "toolu_1");
});

// ── Google Gemini ──

await test("gemini: system instruction, tools, ANY (narrowed to one function when forced), the extra body in config", async () => {
  configure("google-generative-ai", "https://gem.example/v1beta", "gemini-x", { EXTRA_BODY: '{"thinkingConfig":{"includeThoughts":true}}' });
  reply = () => geminiStream([{ text: "好" }], { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 });
  await complete([user("hi")]);
  await complete([user("hi")], { tool: "send_message" });
  const [required, forced] = seen;
  assert.match(required!.url, /^https:\/\/gem\.example\/v1beta\/models\/gemini-x:streamGenerateContent\?alt=sse$/);
  assert.equal(required!.body.systemInstruction.parts[0].text, "SYS");
  assert.deepEqual(required!.body.tools[0].functionDeclarations.map((f: any) => f.name), ["send_message", "end_turn"]);
  assert.deepEqual(required!.body.toolConfig, { functionCallingConfig: { mode: "ANY" } });
  assert.deepEqual(forced!.body.toolConfig, { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["send_message"] } });
  assert.deepEqual(required!.body.generationConfig.thinkingConfig, { includeThoughts: true });
});

await test("gemini: thought signatures (base64, as Gemini sends them) go back on the same parts", async () => {
  configure("google-generative-ai", "https://gem.example/v1beta", "gemini-x");
  reply = () =>
    geminiStream(
      [
        { text: "想", thought: true, thoughtSignature: "dGhvdWdodA==" },
        { functionCall: { name: "send_message", args: { text: "hi" } }, thoughtSignature: "Y2FsbDE=" },
      ],
      { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12, cachedContentTokenCount: 4 },
    );
  const first = await complete([user("hi")]);
  assert.equal(callOf(first).name, "send_message");
  assert.equal((first.content.find((b) => b.type === "toolCall") as any).thoughtSignature, "Y2FsbDE=");
  assert.equal(first.usage.cacheRead, 4);
  await complete([user("hi"), first, result(callOf(first), "sent")]);
  const contents = seen[1]!.body.contents;
  const modelTurn = contents.find((c: any) => c.role === "model");
  assert.ok(modelTurn.parts.some((p: any) => p.functionCall?.name === "send_message" && p.thoughtSignature === "Y2FsbDE="));
  assert.ok(modelTurn.parts.some((p: any) => p.thought && p.thoughtSignature === "dGhvdWdodA=="));
  assert.ok(contents.at(-1).parts.some((p: any) => p.functionResponse?.name === "send_message"));
});

await test("cost: estimated from the prices when the provider doesn't bill it", async () => {
  configure("anthropic-messages", "https://api.anthropic.example", "claude-x", { PRICE_INPUT: "3", PRICE_CACHED: "0.3", PRICE_OUTPUT: "15" });
  reply = () => anthropicStream([{ type: "text", text: "好" }], { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 });
  const message = await complete([user("hi")]);
  assert.equal(message.usage.cost.total, 3 + 15 + 0.3);
  assert.ok(!message.usage.cost.totalFromProvider);
});

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} model protocol tests passed`);
process.exit(failed ? 1 : 0);
