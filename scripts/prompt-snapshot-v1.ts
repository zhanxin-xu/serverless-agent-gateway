/**
 * One-off (P0 of docs/design/modules.md): what the model got before the
 * module refactor, saved as fixtures for scripts/prompt-report.ts.
 *
 *   npx tsx scripts/prompt-snapshot-v1.ts
 *
 * Every optional feature is configured with fake values, so every tool shows.
 * Writes scripts/fixtures/prompt-v1/<scene>-<channel>.txt and tools.json.
 */
import { mkdir, writeFile } from "node:fs/promises";

for (const [name, value] of Object.entries({
  OPENAI_RESPONSES_API_KEY: "k",
  DEEPSEEK_API_KEY: "k",
  IMAGE_API_KEY: "k",
  TTS_API_KEY: "k",
  UPSTASH_VECTOR_REST_URL: "https://vector.example.com",
  UPSTASH_VECTOR_REST_TOKEN: "k",
  SANDBOX_ENABLED: "1",
})) {
  process.env[name] = value;
}

const { SCENE_RULES, SYSTEM_PROMPT } = await import("../src/agent/system-prompt.js");
const { channels } = await import("../src/channels/index.js");
const { Toolset } = await import("../src/tools/registry.js");

const out = new URL("./fixtures/prompt-v1/", import.meta.url);
await mkdir(out, { recursive: true });
for (const scene of ["private", "group"] as const) {
  for (const channel of ["qq", "telegram", "http"]) {
    // As runner.ts's systemPrompt() builds it (no per-chat extra settings).
    const prompt = [SYSTEM_PROMPT, SCENE_RULES[scene], channels.get(channel)!.promptHint].filter(Boolean).join("\n\n");
    await writeFile(new URL(`${scene}-${channel}.txt`, out), `${prompt}\n`);
  }
}
await writeFile(new URL("tools.json", out), `${JSON.stringify(new Toolset().definitions(), null, 2)}\n`);
console.log(`saved to ${out.pathname}`);
