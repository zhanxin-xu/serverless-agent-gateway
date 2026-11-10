/**
 * One turn of the agent loop, driven by the chat's event log (see
 * conversation/events.ts), over whichever chat model is configured (src/modules/model):
 *
 *   each step: read the log's new events → derive the messages → call the model
 *   → append its message verbatim (reasoning included) → append a tool/call
 *   marker, run the tool, append its tool/result → repeat.
 *
 * Nothing lives only in memory: messages that arrive mid-turn show up at the
 * next step, and a run that dies can be picked up from the log. Each request
 * extends the previous one, so the prompt cache keeps hitting.
 *
 * Every request asks for a tool call, so the model acts through tools. The
 * turn ends when the model calls end_turn (usually alongside its last
 * message), or after the last step: when the step budget runs out, a note
 * tells the model to wrap up and the tool choice asks for send_message.
 * Where a protocol can't force a tool (Anthropic while thinking) and the
 * model answers in plain text, that text ends the turn and the runner sends it.
 * Every call in a step runs, in order, wherever end_turn sits among them; the
 * turn ends after the step, unless a message failed to send (before the last
 * step), so the model can react. When the failure was the platform being unreachable,
 * the turn ends anyway: a retry would only wait out the same timeout.
 *
 * Time (agent/budget.ts): every model and tool call must end before the
 * function's hand-off margin. When the run can continue in a fresh function
 * (`continuable`), a step doesn't start without enough time left: the turn
 * ends "paused", and a model call that times out or fails transiently ends it
 * "interrupted"; either way the runner hands the chat over and the next run
 * continues the turn from the log (`resume`). A run that can't continue (sync
 * channels) gets a forced last step instead, like the step budget.
 */
import { config } from "../config.js";
import type { NewEvent, SessionEvent, TurnEndReason } from "../conversation/events.js";
import type { UnfinishedTurn } from "../conversation/recovery.js";
import type { Session } from "../conversation/session.js";
import { undelivered } from "../conversation/undelivered.js";
import { LockLostError } from "../store/types.js";
import type { Toolset } from "../modules/registry.js";
import type { ToolContext } from "../modules/tool.js";
import { callBudgetMs, LAST_STEP_MIN_MS, MIN_CALL_MS, NEW_STEP_MIN_MS, timeLeftMs } from "./budget.js";
import { compactIfNeeded } from "./compaction.js";
import { ModelCallError } from "../llm/errors.js";
import { messageText, promptTokens, toolCalls } from "../llm/content.js";
import type { AssistantMessage, ToolCall } from "../llm/types.js";
import { use } from "../modules/capability.js";
import { chatModelCapability } from "../modules/model/capability.js";

/** A tool call the function had no time left for. */
const NO_TIME_FOR_TOOL =
  "Error: not run, this function is out of time. The turn continues in a fresh function in a moment; call it again there.";

/**
 * Notes ("（系统提示）…") only when there's something the log doesn't show:
 * the turn continues one that was cut off, messages didn't get through, or
 * it's the last step. What to handle and where replies go follow one rule,
 * in the system prompt: the messages since the last turn, and by default the
 * newest of them that @-mentions the bot (else the newest).
 */

/** Undelivered messages quoted in a turn's opening note: the newest few, each cut short. */
const MAX_UNDELIVERED_SHOWN = 3;
const MAX_UNDELIVERED_CHARS = 100;

function undeliveredNote(missed: string[]): string {
  if (!missed.length) return "";
  const quoted = missed
    .slice(-MAX_UNDELIVERED_SHOWN)
    .map((text) => `「${text.length > MAX_UNDELIVERED_CHARS ? `${text.slice(0, MAX_UNDELIVERED_CHARS)}…` : text}」`)
    .join("");
  return `之前有 ${missed.length} 条消息没能发出去：${quoted}。还用得上的话，这一轮补上。`;
}

function resumeNote(resume: UnfinishedTurn): string {
  const why = resume.interruptions ? "上一段的最后一步被打断了，那一步没有结果" : "上一段在这个函数里的时间用完了";
  return `这一轮接着上一段继续：${why}，现在换了一个新的函数接着跑。先看上面已经做了什么、发了什么，从停下的地方接着做，不要重复已经发过的消息。`;
}

export interface TurnOptions {
  session: Session;
  ctx: ToolContext;
  systemPrompt: string;
  /** The tools this chat offers this turn. */
  toolset: Toolset;
  turn: number;
  trigger: "direct" | "ambient";
  /** The messages this turn starts with (not yet handled), oldest first. */
  pending: SessionEvent<"user/message">[];
  /** Whether the message replies go to by default can still take one (QQ: 5 per message). */
  canReply(): Promise<boolean>;
  /** Messages that arrived during the turn, before a step that will show them (the default reply target may move to one). */
  arrived?(messages: SessionEvent<"user/message">[]): Promise<void>;
  /** The platform couldn't be reached this run: the turn ends after the step instead of letting the model retry. */
  unreachable?(): boolean;
  /**
   * Whether the run can hand this turn to a fresh function when time runs out
   * (async channels). If not, the step before the deadline is a forced last step.
   */
  continuable: boolean;
  /** This turn continues an unfinished one (see unfinishedTurn). */
  resume?: UnfinishedTurn;
}

export interface TurnResult {
  steps: number;
  reason: TurnEndReason;
  /** Seq of the newest user message the model saw; the cursor moves here. */
  handledUpTo: number;
  /** Plain text the model wrote without calling a tool (where the protocol couldn't force one). */
  text: string;
  usage: { input: number; cached: number; reasoning: number };
}

export async function runTurn(o: TurnOptions): Promise<TurnResult> {
  const { session, ctx, turn } = o;
  const { toolset } = o;
  const tools = toolset.definitions();
  // Tools are told apart by role (tools/types.ts), never by name.
  const say = toolset.say();
  const talks = toolset.names("say", "talk");
  const hangups = toolset.names("hangup");
  // After each message sent: how to end the turn, so no talking tool has to name the hangup tool.
  const [hangup] = hangups;
  const doneHint = hangup ? `. If you're done, call ${hangup} (in the same step as your last message).` : "";
  const usage = { input: 0, cached: 0, reasoning: 0 };
  let handledUpTo = o.pending.at(-1)!.seq;

  const start = [o.resume ? resumeNote(o.resume) : "", undeliveredNote(undelivered(session.events, (tool) => talks.has(tool)))].join("");
  // Events are written in a few batches per step (each batch is one store call).
  let opening: NewEvent[] = [
    { type: "turn/start", data: { turn, trigger: o.trigger } },
    ...(start ? [{ type: "developer/message" as const, data: { turn, text: `（系统提示）${start}` } }] : []),
  ];
  const turnEnd = (reason: TurnEndReason, error?: string): NewEvent => ({
    type: "turn/end",
    data: { turn, reason, ...(error ? { error } : {}) },
  });
  const result = (step: number, reason: TurnEndReason, text = ""): TurnResult => ({ steps: step, reason, handledUpTo, text, usage });
  const runCall = (call: ToolCall): Promise<string> =>
    call.argumentsError
      ? Promise.resolve(`Error: the arguments weren't valid JSON (${call.argumentsError}); call ${call.name} again with a JSON object.`)
      : toolset.run(call.name, call.arguments, ctx);

  for (let step = 1; ; step++) {
    const notes: string[] = [];
    // Messages that arrived since the last step are in the log, where the model reads them;
    // the default reply target follows them. (The run read the log just before starting the turn.)
    if (step > 1) await session.refresh();
    const arrived = session.messagesAfter(handledUpTo);
    if (arrived.length) {
      await o.arrived?.(arrived);
      handledUpTo = arrived.at(-1)!.seq;
    }

    // Not enough time for another step here: a fresh function carries on (or, if it can't, this step is the last).
    const left = timeLeftMs(ctx.deadline);
    if (o.continuable && left < NEW_STEP_MIN_MS) {
      await session.append(...opening, turnEnd("paused"));
      return result(step - 1, "paused");
    }
    const outOfTime = !o.continuable && left < LAST_STEP_MIN_MS;
    const lastStep = step >= config.agent.maxSteps || outOfTime;
    if (lastStep) {
      if (!(await o.canReply())) {
        const reason = outOfTime ? "out-of-time" : "max-steps";
        await session.append(...opening, turnEnd(reason));
        return result(step - 1, reason);
      }
      notes.push(
        `（系统提示）${outOfTime ? "时间快用完了" : "步数用完了"}，这是这一轮的最后一步：必须现在用 ${say} 发一条消息，发完这一轮就结束。` +
          "说出已经得到的结果；没做完就说做到哪了、卡在哪、接下来怎么办。",
      );
    }
    await session.append(
      ...opening,
      ...notes.map((text) => ({ type: "developer/message" as const, data: { turn, text } })),
      { type: "step/start", data: { turn, step, endUser: ctx.chat.endUser } },
    );
    opening = [];

    let message: AssistantMessage;
    try {
      message = await use(chatModelCapability).complete({
        systemPrompt: o.systemPrompt,
        messages: await session.messages(),
        tools,
        // Every step acts through a tool: talk, or hang up.
        // The last step must say something: whoever is waiting hears the result or where it got stuck.
        toolChoice: lastStep ? { tool: say } : "required",
        cacheKey: session.cacheKey,
        endUser: ctx.chat.endUser,
        timeoutMs: Math.min(config.model.timeoutMs, callBudgetMs(ctx.deadline)),
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      // A timeout or a provider hiccup: a fresh function retries the step. Anything else fails the turn.
      const interrupted = o.continuable && err instanceof ModelCallError && err.transient;
      await session.append(
        { type: "assistant/attempt", data: { turn, step, error } },
        { type: "step/end", data: { turn, step } },
        turnEnd(interrupted ? "interrupted" : "error", error),
      );
      if (!interrupted) throw err;
      console.warn(`[agent] turn ${turn} step ${step} interrupted: ${error}`);
      return result(step, "interrupted");
    }

    usage.input = promptTokens(message.usage);
    usage.cached = message.usage.cacheRead;
    usage.reasoning += message.usage.reasoning ?? 0;
    if (message.stopReason === "length") console.warn(`[agent] turn ${turn} step ${step}: the model hit its output limit`);

    const calls = toolCalls(message);
    await session.append(
      { type: "assistant/message", data: { turn, step, message } },
      ...calls
        .filter((c) => !hangups.has(c.name))
        .map((c) => ({ type: "tool/call" as const, data: { turn, step, callId: c.id, name: c.name } })),
    );

    // No tool call (the protocol couldn't force one): the plain text is the final answer.
    if (calls.length === 0) {
      await session.append({ type: "step/end", data: { turn, step } }, turnEnd("completed"));
      return result(step, "completed", messageText(message));
    }

    // The tool/call markers are already in the log, so a run killed mid-tool is
    // recovered as "may or may not have taken effect"; results are written together.
    const hangingUp = calls.some((c) => hangups.has(c.name));
    let sendFailed = false;
    const results: NewEvent[] = [];
    for (const call of calls) {
      if (hangups.has(call.name)) continue;
      // Tools keep to the time budget themselves; this catches the step that used it all up.
      let output = callBudgetMs(ctx.deadline) < MIN_CALL_MS ? NO_TIME_FOR_TOOL : await runCall(call);
      console.log(`[agent] tool ${call.name}(${JSON.stringify(call.arguments)}) -> ${output.slice(0, 200)}`);
      const failed = output.startsWith("Error:");
      sendFailed ||= talks.has(call.name) && failed;
      if (talks.has(call.name) && !failed) output += doneHint;
      results.push({ type: "tool/result", data: { turn, step, callId: call.id, output } });
    }
    const unreachable = sendFailed && (o.unreachable?.() ?? false);
    const done = lastStep || unreachable || (hangingUp && !sendFailed);
    // Images a tool returned (read_file, generate_image…) are stored and shown after the step's tool results.
    const images = ctx.images.splice(0);
    const imageKeys = images.length
      ? await session.storeToolImages(`t${turn}s${step}`, images)
      : [];
    const reason: TurnEndReason = unreachable ? "unreachable" : !lastStep ? "completed" : outOfTime ? "out-of-time" : "max-steps";
    await session.append(
      ...results,
      ...calls
        .filter((c) => hangups.has(c.name))
        .map((c) => ({
          type: "tool/result" as const,
          data: { turn, step, callId: c.id, output: done ? "turn ended" : "not ended: a message failed to send, see the error above" },
        })),
      ...(imageKeys.length ? [{ type: "tool/images" as const, data: { turn, step, images: imageKeys } }] : []),
      { type: "step/end", data: { turn, step } },
      ...(done ? [turnEnd(reason)] : []),
    );
    if (done) return result(step, reason);

    // Unhandled messages and the ones this turn may still reply to stay verbatim. Compaction is an
    // optimization: when it fails, or there's no time for it here, a later step does it.
    if (!o.continuable || timeLeftMs(ctx.deadline) >= NEW_STEP_MIN_MS) {
      try {
        await compactIfNeeded(session, {
          systemPrompt: o.systemPrompt,
          tools,
          inputTokens: promptTokens(message.usage),
          endUser: ctx.chat.endUser,
          keepFrom: o.pending[0]!.seq,
          timeoutMs: callBudgetMs(ctx.deadline),
        });
      } catch (err) {
        if (err instanceof LockLostError) throw err;
        console.warn(`[compaction] ${session.chatKey}: skipped (${err instanceof Error ? err.message : String(err)})`);
      }
    }
  }
}
