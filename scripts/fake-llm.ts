/**
 * Model servers for the tests, speaking each protocol's streaming wire format
 * (server-sent events) the way the real APIs do, so requests go through
 * pi-ai's real clients and parsers.
 */

const sse = (events: Array<{ event?: string; data: unknown }>) =>
  new Response(events.map((e) => `${e.event ? `event: ${e.event}\n` : ""}data: ${JSON.stringify(e.data)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });

/** OpenAI Responses API: output items (message, function_call, reasoning) streamed item by item. */
export function responsesStream(output: any[], usage: Record<string, unknown>, id = "resp_1") {
  const events: Array<{ event: string; data: any }> = [];
  const push = (type: string, data: Record<string, unknown>) => events.push({ event: type, data: { type, ...data } });
  push("response.created", { response: { id, object: "response", status: "in_progress", output: [] } });
  output.forEach((item, output_index) => {
    if (item.type === "message") {
      push("response.output_item.added", { output_index, item: { ...item, status: "in_progress", content: [] } });
      item.content.forEach((part: any, content_index: number) => {
        push("response.content_part.added", { output_index, content_index, item_id: item.id, part: { ...part, text: "" } });
        push("response.output_text.delta", { output_index, content_index, item_id: item.id, delta: part.text });
        push("response.output_text.done", { output_index, content_index, item_id: item.id, text: part.text });
        push("response.content_part.done", { output_index, content_index, item_id: item.id, part });
      });
    } else if (item.type === "function_call") {
      push("response.output_item.added", { output_index, item: { ...item, arguments: "" } });
      push("response.function_call_arguments.delta", { output_index, item_id: item.id, delta: item.arguments });
      push("response.function_call_arguments.done", { output_index, item_id: item.id, arguments: item.arguments });
    } else if (item.type === "reasoning") {
      push("response.output_item.added", { output_index, item: { ...item, summary: [] } });
      (item.summary ?? []).forEach((part: any, summary_index: number) => {
        push("response.reasoning_summary_part.added", { output_index, summary_index, item_id: item.id, part: { ...part, text: "" } });
        push("response.reasoning_summary_text.delta", { output_index, summary_index, item_id: item.id, delta: part.text });
        push("response.reasoning_summary_text.done", { output_index, summary_index, item_id: item.id, text: part.text });
        push("response.reasoning_summary_part.done", { output_index, summary_index, item_id: item.id, part });
      });
    }
    push("response.output_item.done", { output_index, item });
  });
  push("response.completed", { response: { id, object: "response", status: "completed", output, usage } });
  return sse(events);
}

/** OpenAI Chat Completions: one choice's deltas (reasoning, text, tool calls), then usage. */
export function completionsStream(
  message: { content?: string; reasoning?: { field: string; text: string }; reasoningDetails?: unknown[]; toolCalls?: Array<{ id: string; name: string; arguments: string }> },
  usage: Record<string, unknown>,
) {
  const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({
    data: { id: "chatcmpl-1", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finish }] },
  });
  const events = [chunk({ role: "assistant" })];
  if (message.reasoning) events.push(chunk({ [message.reasoning.field]: message.reasoning.text }));
  if (message.reasoningDetails) events.push(chunk({ reasoning_details: message.reasoningDetails }));
  if (message.content) events.push(chunk({ content: message.content }));
  message.toolCalls?.forEach((call, index) =>
    events.push(chunk({ tool_calls: [{ index, id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } }] })),
  );
  events.push(chunk({}, message.toolCalls?.length ? "tool_calls" : "stop"));
  events.push({ data: { id: "chatcmpl-1", object: "chat.completion.chunk", choices: [], usage } as never });
  return new Response(`${events.map((e) => `data: ${JSON.stringify(e.data)}\n\n`).join("")}data: [DONE]\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}

/** Anthropic Messages: content blocks (thinking with its signature, redacted thinking, text, tool_use). */
export function anthropicStream(content: any[], usage: Record<string, unknown>) {
  const events: Array<{ event: string; data: any }> = [];
  const push = (type: string, data: Record<string, unknown>) => events.push({ event: type, data: { type, ...data } });
  push("message_start", {
    message: { id: "msg_1", type: "message", role: "assistant", model: "claude", content: [], stop_reason: null, usage: { ...usage, output_tokens: 1 } },
  });
  content.forEach((block, index) => {
    if (block.type === "thinking") {
      push("content_block_start", { index, content_block: { type: "thinking", thinking: "", signature: "" } });
      push("content_block_delta", { index, delta: { type: "thinking_delta", thinking: block.thinking } });
      push("content_block_delta", { index, delta: { type: "signature_delta", signature: block.signature } });
    } else if (block.type === "redacted_thinking") {
      push("content_block_start", { index, content_block: block });
    } else if (block.type === "text") {
      push("content_block_start", { index, content_block: { type: "text", text: "" } });
      push("content_block_delta", { index, delta: { type: "text_delta", text: block.text } });
    } else if (block.type === "tool_use") {
      push("content_block_start", { index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } });
      push("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    }
    push("content_block_stop", { index });
  });
  const stop = content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
  push("message_delta", { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: usage.output_tokens } });
  push("message_stop", {});
  return sse(events);
}

/** Gemini generateContent (streamGenerateContent?alt=sse): parts (thoughts, text, functionCall with thoughtSignature). */
export function geminiStream(parts: any[], usageMetadata: Record<string, unknown>) {
  return sse([
    { data: { candidates: [{ content: { role: "model", parts }, finishReason: "STOP", index: 0 }], usageMetadata, modelVersion: "gemini", responseId: "gem_1" } },
  ]);
}
