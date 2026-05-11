import OpenAI from "openai";
import { setTimeout as sleep } from "node:timers/promises";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { runHooks } from "./hooks/index.js";
import { toAssistantMessage } from "./messages.js";
import { createSpanId, createTraceId, recordObservabilityEvent, withExecutionContext } from "./observability/runtime.js";
import { buildPromptEnvelope } from "./prompt/builder.js";
import type { StaticPromptSource } from "./prompt/types.js";
import { runDeliveryValidation } from "./delivery.js";
import { RUNTIME_CONFIG } from "./runtime-config.js";
import {
  classifyErrorForRecovery,
  classifyResponseForRecovery,
  createInitialRecoveryState,
  formatRecoveryFailure,
  makePromptTooLongSignal,
  selectRecoveryDecision,
} from "./recovery.js";
import { drainBackgroundNotifications } from "./tools/background-task.js";
import { drainScheduledNotifications, tickScheduler } from "./tools/scheduler.js";
import { COMPACT_THRESHOLD_TOKENS, compactMessages, estimateTokensFromMessages } from "./tools/context-compact.js";
import { previewToolCall, runToolByName } from "./tools/index.js";
import { autoExtractMemory, buildMemoryInjectionForQuery } from "./tools/memory.js";
import { drainSubagentNotifications } from "./tools/subagent.js";
import { drainTeamNotifications } from "./tools/team.js";
import { runAutonomyTick } from "./tools/autonomy.js";

export type AgentRuntimeState = {
  sessionId: string;
  roundsWithoutTodo: number;
  activeTaskId: number | null;
  lastMemoryInput: string | null;
  roundCounter: number;
  touchedPaths: Set<string>;
  wroteWorkspaceFiles: boolean;
};

type AgentLoopOptions = {
  client: OpenAI;
  model: string;
  promptSource: StaticPromptSource;
  tools: ChatCompletionTool[];
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
};

function appendSystemMessages(messages: ChatCompletionMessageParam[], items: string[]): void {
  for (const item of items) {
    const content = item.trim();
    if (!content) {
      continue;
    }
    messages.push({ role: "system", content });
  }
}

function makeHookBlockedOutput(reason: string | null): string {
  return JSON.stringify(
    {
      ok: false,
      error: {
        code: "HOOK_BLOCKED",
        message: reason ?? "blocked by hook",
      },
    },
    null,
    2,
  );
}

export async function agentLoop(opts: AgentLoopOptions): Promise<void> {
  const { client, model, promptSource, tools, messages, runtimeState } = opts;

  const summarizeText = (value: string, max = 160): string => {
    const trimmed = value.trim();
    if (trimmed.length <= max) {
      return trimmed;
    }
    return `${trimmed.slice(0, max)}...`;
  };

  const analyzeToolOutput = (output: string): { ok: boolean; errorCode: string | null; summary: string } => {
    try {
      const parsed = JSON.parse(output) as { ok?: boolean; error?: { code?: unknown } };
      return {
        ok: parsed.ok !== false,
        errorCode: parsed.ok === false ? String(parsed.error?.code ?? "UNKNOWN_ERROR") : null,
        summary: summarizeText(output, 220),
      };
    } catch {
      return { ok: true, errorCode: null, summary: summarizeText(output, 220) };
    }
  };

  const parseArgs = (raw: string): Record<string, unknown> => {
    try {
      return JSON.parse(raw || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  const parseTaskIdFromOutput = (output: string): number | null => {
    try {
      const parsed = JSON.parse(output) as { id?: unknown; error?: unknown };
      if (parsed && !parsed.error) {
        const id = Number(parsed.id);
        if (Number.isInteger(id) && id > 0) {
          return id;
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  const trackWriteSideEffect = (toolName: string, args: Record<string, unknown>): void => {
    if (toolName !== "write_file" && toolName !== "edit_file") {
      return;
    }
    const target = typeof args.path === "string" ? args.path.trim() : "";
    runtimeState.wroteWorkspaceFiles = true;
    if (target) {
      runtimeState.touchedPaths.add(target);
    }
  };

  const isTodoAllCompleted = (args: Record<string, unknown>): boolean => {
    const items = args.items;
    if (!Array.isArray(items) || items.length === 0) {
      return false;
    }
    return items.every((item) => {
      if (typeof item !== "object" || item === null) {
        return false;
      }
      const status = String((item as Record<string, unknown>).status ?? "").toLowerCase();
      return status === "completed";
    });
  };

  const makeFailureMessage = async (
    traceId: string,
    phase: "model_request" | "model_response",
    decision: { reason: string; detail: string },
  ): Promise<void> => {
    const failure = formatRecoveryFailure({
      action: "fail",
      reason: decision.reason,
      detail: decision.detail,
      nextState: createInitialRecoveryState(),
    });
    await recordObservabilityEvent("error", { phase, message: failure }, { traceId });
    messages.push({ role: "assistant", content: failure });
  };

  while (true) {
    runtimeState.roundCounter += 1;
    runtimeState.touchedPaths.clear();
    runtimeState.wroteWorkspaceFiles = false;
    const traceId = createTraceId();
    let stopReason = "tool_calls_processed";
    let stopToolCallCount = 0;
    const latestUser = [...messages]
      .reverse()
      .find((item) => item.role === "user" && typeof item.content === "string") as
      | { role: "user"; content: string }
      | undefined;
    try {
      await recordObservabilityEvent(
        "loop_start",
        {
          round: runtimeState.roundCounter,
          latestUserInput: latestUser?.content ? summarizeText(latestUser.content) : "",
        },
        { traceId },
      );
      const sessionStartHooks = await runHooks("SessionStart", {
        session_id: runtimeState.sessionId,
        trace_id: traceId,
        payload: {
          round: runtimeState.roundCounter,
          rounds_without_todo: runtimeState.roundsWithoutTodo,
          latest_user_input: latestUser?.content ?? "",
        },
      });
      if (sessionStartHooks.blocked) {
        stopReason = "session_start_blocked";
        messages.push({
          role: "assistant",
          content: `Current round blocked by hook: ${sessionStartHooks.blockReason ?? "blocked by hook"}`,
        });
        return;
      }

      if (latestUser?.content && runtimeState.lastMemoryInput !== latestUser.content) {
        await autoExtractMemory("user", latestUser.content);
        runtimeState.lastMemoryInput = latestUser.content;
      }

      try {
        const autonomyRaw = await runAutonomyTick();
        const autonomy = JSON.parse(autonomyRaw) as { ok?: boolean; action?: string; taskId?: number };
        if (autonomy.ok && autonomy.action === "claimed") {
          console.log(`\u001b[36m[autonomy]\u001b[0m claimed task #${autonomy.taskId ?? "?"}`);
        }
      } catch {
        // keep agent loop resilient if autonomy tick fails
      }

      try {
        await tickScheduler();
      } catch {
        // keep agent loop resilient if scheduler tick fails
      }

      const dynamicSystemMessages = [...sessionStartHooks.messages];
      const scheduledNotifications = await drainScheduledNotifications();
      if (scheduledNotifications.length > 0) {
        const summaryLines = scheduledNotifications.map((item) => {
          const preview = item.prompt.replace(/\s+/g, " ").trim().slice(0, 160);
          return `schedule#${item.scheduleId} fired_at_ms=${item.firedAt}; prompt=${preview}`;
        });
        const blocks = scheduledNotifications
          .map(
            (item) =>
              `<scheduled_prompt id="${item.scheduleId}" fired_at_ms="${item.firedAt}" recurring="${item.recurring}">\n${item.prompt}\n</scheduled_prompt>`,
          )
          .join("\n");
        dynamicSystemMessages.push(
          `${blocks}\n<scheduled_prompt_instruction>Treat each scheduled_prompt as a user intent that became due now. Handle it in this round.</scheduled_prompt_instruction>`,
        );
        console.log(`\u001b[36m[scheduled prompts]\u001b[0m\n${summaryLines.join("\n")}`);
        for (const item of scheduledNotifications) {
          await recordObservabilityEvent(
            "notification",
            {
              source: "schedule",
              scheduleId: item.scheduleId,
              firedAt: item.firedAt,
              recurring: item.recurring,
              prompt: item.prompt,
            },
            { traceId },
          );
        }
      }
      const notifications = drainSubagentNotifications();
      if (notifications.length > 0) {
        const summaryLines = notifications.map((n) => {
          const output = typeof n.output === "string" ? n.output.slice(0, 200) : "";
          const error = typeof n.error === "string" ? n.error.slice(0, 200) : "";
          if (n.status === "completed") {
            return `agent#${n.agentId}(${n.agentName}) updated_at_ms=${n.updatedAt}; output=${output}`;
          }
          return `agent#${n.agentId}(${n.agentName}) updated_at_ms=${n.updatedAt}; error=${error}`;
        });
        const reminder = `<subagent_notifications>\n${summaryLines.join("\n")}\n</subagent_notifications>`;
        dynamicSystemMessages.push(reminder);
        console.log(`\u001b[36m[subagent notifications]\u001b[0m\n${summaryLines.join("\n")}`);
      }
      const bgNotifications = drainBackgroundNotifications();
      if (bgNotifications.length > 0) {
        const summaryLines = bgNotifications.map((n) => {
          const out = n.stdout ? n.stdout.slice(0, 160) : "";
          const err = n.stderr ? n.stderr.slice(0, 160) : "";
          return n.status === "completed"
            ? `task#${n.taskId} finished_at_ms=${n.finishedAt}; command=${n.command}; stdout=${out}`
            : `task#${n.taskId} finished_at_ms=${n.finishedAt}; command=${n.command}; stderr=${err}`;
        });
        const reminder = `<background_notifications>\n${summaryLines.join("\n")}\n</background_notifications>`;
        dynamicSystemMessages.push(reminder);
        console.log(`\u001b[36m[background notifications]\u001b[0m\n${summaryLines.join("\n")}`);
        for (const item of bgNotifications) {
          await recordObservabilityEvent(
            "notification",
            {
              source: "background",
              taskId: item.taskId,
              status: item.status,
              command: item.command,
              exitCode: item.exitCode,
            },
            { traceId },
          );
        }
      }
      const teamNotifications = drainTeamNotifications();
      if (teamNotifications.length > 0) {
        const summaryLines = teamNotifications.map((n) => {
          const c = n.content.slice(0, 120);
          const req = n.requestId ? ` request_id=${n.requestId}` : "";
          return `to#${n.teammateId}(${n.teammateName}) ${n.messageType} from=${n.from}${req} created_at_ms=${n.createdAt}: ${c}`;
        });
        const reminder = `<team_notifications>\n${summaryLines.join("\n")}\n</team_notifications>`;
        dynamicSystemMessages.push(reminder);
        console.log(`\u001b[36m[team notifications]\u001b[0m\n${summaryLines.join("\n")}`);
        for (const item of teamNotifications) {
          await recordObservabilityEvent(
            "notification",
            {
              source: "team",
              teammateId: item.teammateId,
              teammateName: item.teammateName,
              messageType: item.messageType,
              requestId: item.requestId ?? null,
              content: item.content,
            },
            { traceId },
          );
        }
      }
      let memoryContext: string | null = null;
      if (latestUser?.content) {
        const injected = await buildMemoryInjectionForQuery(latestUser.content);
        if (injected.content) {
          memoryContext = injected.content;
          console.log(
            `\u001b[36m[memory inject]\u001b[0m entries=${injected.usedEntries} tokens=${injected.estimatedTokens}`,
          );
        }
      }
      if (runtimeState.roundsWithoutTodo >= 3) {
        dynamicSystemMessages.push(
          "<reminder>Please call the todo tool to update the task list and maintain progress.</reminder>",
        );
      }
      const promptEnvelope = buildPromptEnvelope({
        ...promptSource,
        memoryContext,
        dynamicMessages: dynamicSystemMessages,
      });
      const buildRequestMessages = (continuedAssistantContent: string, continuationPrompt: string | null) => {
        const requestMessages: ChatCompletionMessageParam[] = [
          { role: "system", content: promptEnvelope.primarySystemPrompt },
          ...promptEnvelope.supplementalSystemMessages.map(
            (content) => ({ role: "system", content }) satisfies ChatCompletionMessageParam,
          ),
          ...messages,
        ];
        if (continuedAssistantContent) {
          requestMessages.push({ role: "assistant", content: continuedAssistantContent });
          requestMessages.push({ role: "user", content: continuationPrompt ?? "Continue." });
        }
        return requestMessages;
      };

      let recoveryState = createInitialRecoveryState();
      let continuedAssistantContent = "";
      let continuationPrompt: string | null = null;
      let message: OpenAI.Chat.Completions.ChatCompletionMessage | null = null;

      while (!message) {
        const requestMessages = buildRequestMessages(continuedAssistantContent, continuationPrompt);
        const estimatedPromptTokens = estimateTokensFromMessages(requestMessages);
        if (estimatedPromptTokens > COMPACT_THRESHOLD_TOKENS) {
          const decision = selectRecoveryDecision(
            makePromptTooLongSignal(
              `estimated prompt tokens ${estimatedPromptTokens} exceeded threshold ${COMPACT_THRESHOLD_TOKENS}`,
              "preflight_estimate",
            ),
            recoveryState,
          );
          recoveryState = decision.nextState;
          await recordObservabilityEvent(
            "recovery_decision",
            {
              round: runtimeState.roundCounter,
              action: decision.action,
              reason: decision.reason,
              detail: decision.detail,
              state: recoveryState,
              estimatedPromptTokens,
            },
            { traceId },
          );
          if (decision.action !== "compact") {
            stopReason = "recovery_failed";
            await makeFailureMessage(traceId, "model_request", decision);
            return;
          }
          const compactResult = await compactMessages({ messages }, "auto");
          console.log(
            `\u001b[36m[auto compact]\u001b[0m before=${compactResult.estimatedBefore} after=${compactResult.estimatedAfter} snapshot=${compactResult.transcriptPath}`,
          );
          continue;
        }

        await recordObservabilityEvent(
          "model_request",
          {
            round: runtimeState.roundCounter,
            messageCount: requestMessages.length,
            estimatedPromptTokens,
            latestUserInput: latestUser?.content ? summarizeText(latestUser.content) : "",
            recoveryState,
            continuedAssistantChars: continuedAssistantContent.length,
          },
          { traceId },
        );

        try {
          const response = await client.chat.completions.create({
            model,
            messages: requestMessages,
            tools,
            max_tokens: 8_000,
          });

          const candidate = response.choices[0]?.message;
          if (!candidate) {
            stopReason = "empty_model_response";
            await recordObservabilityEvent("error", { phase: "model_response", message: "empty model response" }, { traceId });
            return;
          }

          const toolCallCount = candidate.tool_calls?.length ?? 0;
          const content = typeof candidate.content === "string" ? candidate.content : "";
          const finishReason = response.choices[0]?.finish_reason ?? null;
          await recordObservabilityEvent(
            "model_response",
            {
              round: runtimeState.roundCounter,
              toolCallCount,
              completionTokens: response.usage?.completion_tokens ?? 0,
              finishReason,
              content: content ? summarizeText(content) : "",
            },
            { traceId },
          );

          const recoverySignal = classifyResponseForRecovery({
            finishReason,
            toolCallCount,
            content,
          });
          if (recoverySignal) {
            const decision = selectRecoveryDecision(recoverySignal, recoveryState);
            recoveryState = decision.nextState;
            await recordObservabilityEvent(
              "recovery_decision",
              {
                round: runtimeState.roundCounter,
                action: decision.action,
                reason: decision.reason,
                detail: decision.detail,
                state: recoveryState,
                finishReason,
              },
              { traceId },
            );
            if (decision.action === "continue") {
              continuedAssistantContent += content;
              continuationPrompt = decision.prompt;
              console.log(`\u001b[36m[recovery continue]\u001b[0m attempts=${recoveryState.continuationAttempts}`);
              continue;
            }
            stopReason = "recovery_failed";
            await makeFailureMessage(traceId, "model_response", decision);
            return;
          }

          message = continuedAssistantContent
            ? ({
                ...candidate,
                content: `${continuedAssistantContent}${content}`,
              } as OpenAI.Chat.Completions.ChatCompletionMessage)
            : candidate;
        } catch (error) {
          const decision = selectRecoveryDecision(classifyErrorForRecovery(error), recoveryState);
          recoveryState = decision.nextState;
          await recordObservabilityEvent(
            "recovery_decision",
            {
              round: runtimeState.roundCounter,
              action: decision.action,
              reason: decision.reason,
              detail: decision.detail,
              state: recoveryState,
            },
            { traceId },
          );
          if (decision.action === "compact") {
            const compactResult = await compactMessages({ messages }, "auto");
            console.log(
              `\u001b[36m[recovery compact]\u001b[0m before=${compactResult.estimatedBefore} after=${compactResult.estimatedAfter} snapshot=${compactResult.transcriptPath}`,
            );
            continue;
          }
          if (decision.action === "backoff") {
            console.log(
              `\u001b[36m[recovery backoff]\u001b[0m delay=${decision.delayMs}ms attempts=${recoveryState.transportAttempts}`,
            );
            await sleep(decision.delayMs);
            continue;
          }
          stopReason = "recovery_failed";
          await makeFailureMessage(traceId, "model_request", decision);
          return;
        }
      }

      messages.push(toAssistantMessage(message));

      const toolCalls = message.tool_calls ?? [];
      stopToolCallCount = toolCalls.length;
      if (toolCalls.length === 0) {
        stopReason = "assistant_response";
        runtimeState.roundsWithoutTodo += 1;
        return;
      }

      let usedTodo = false;
      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") {
          continue;
        }

        const toolArgs = parseArgs(toolCall.function.arguments);
        const preview = previewToolCall(toolCall.function.name, toolCall.function.arguments);
        const spanId = createSpanId();
        await recordObservabilityEvent(
          "tool_call",
          {
            toolName: toolCall.function.name,
            preview,
            argumentsJson: toolCall.function.arguments,
          },
          { traceId, spanId },
        );
        console.log(`\u001b[33m$ ${preview}\u001b[0m`);

        const preToolHooks = await runHooks("PreToolUse", {
          session_id: runtimeState.sessionId,
          trace_id: traceId,
          span_id: spanId,
          payload: {
            tool_name: toolCall.function.name,
            tool_arguments: toolArgs,
          },
        });
        appendSystemMessages(messages, preToolHooks.messages);

        let toolOutput = "";
        let durationMs = 0;
        if (preToolHooks.blocked) {
          toolOutput = makeHookBlockedOutput(preToolHooks.blockReason);
        } else {
          const startedAt = Date.now();
          toolOutput = await withExecutionContext({ traceId, spanId }, async () =>
            runToolByName(toolCall.function.name, toolCall.function.arguments),
          );
          durationMs = Date.now() - startedAt;
        }

        console.log(toolOutput);
        const analyzed = analyzeToolOutput(toolOutput);
        await recordObservabilityEvent(
          "tool_result",
          {
            toolName: toolCall.function.name,
            durationMs,
            ok: analyzed.ok,
            errorCode: analyzed.errorCode,
            outputSummary: analyzed.summary,
          },
          { traceId, spanId },
        );
        if (analyzed.errorCode?.startsWith("SECURITY_")) {
          await recordObservabilityEvent(
            "security_blocked",
            {
              toolName: toolCall.function.name,
              errorCode: analyzed.errorCode,
            },
            { traceId, spanId },
          );
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolOutput,
        });

        if (!preToolHooks.blocked) {
          if (analyzed.ok) {
            trackWriteSideEffect(toolCall.function.name, toolArgs);
          }
          const postToolHooks = await runHooks("PostToolUse", {
            session_id: runtimeState.sessionId,
            trace_id: traceId,
            span_id: spanId,
            payload: {
              tool_name: toolCall.function.name,
              tool_arguments: toolArgs,
              tool_output: toolOutput,
              tool_ok: analyzed.ok,
              error_code: analyzed.errorCode,
            },
          });
          appendSystemMessages(messages, postToolHooks.messages);
        }

        if (preToolHooks.blocked) {
          continue;
        }

        if (toolCall.function.name === "todo") {
          usedTodo = true;

          if (runtimeState.activeTaskId && isTodoAllCompleted(toolArgs)) {
            const autoUpdateArgs = JSON.stringify({
              task_id: runtimeState.activeTaskId,
              status: "completed",
            });
            console.log(`\u001b[33m$ task_update ${runtimeState.activeTaskId} (auto)\u001b[0m`);
            const autoOutput = await withExecutionContext({ traceId, spanId: createSpanId() }, async () =>
              runToolByName("task_update", autoUpdateArgs),
            );
            console.log(autoOutput);
            runtimeState.activeTaskId = null;
          }
        }

        if (toolCall.function.name === "task_create") {
          const createdId = parseTaskIdFromOutput(toolOutput);
          if (createdId) {
            runtimeState.activeTaskId = createdId;
          }
        }

        if (toolCall.function.name === "task_update") {
          const taskId = Number(toolArgs.task_id);
          const status = String(toolArgs.status ?? "");
          if (runtimeState.activeTaskId && taskId === runtimeState.activeTaskId && status === "completed") {
            runtimeState.activeTaskId = null;
          }
        }
      }

      if (RUNTIME_CONFIG.deliveryAutoRunEnabled && runtimeState.wroteWorkspaceFiles) {
        const report = await runDeliveryValidation({
          mode: "auto",
          changedPaths: [...runtimeState.touchedPaths],
          traceId,
        });
        const summary =
          report.summary.status === "passed"
            ? `Auto delivery validation passed (${report.summary.passedStages}/${report.summary.totalStages} stages passed).`
            : `Auto delivery validation failed at ${report.latestFailure?.stage ?? "unknown"}: ${report.latestFailure?.code ?? "UNKNOWN"}. ${report.latestFailure?.suggestion ?? ""}`.trim();
        messages.push({
          role: "assistant",
          content: summary,
        });
        stopReason = report.summary.status === "passed" ? "auto_delivery_passed" : "auto_delivery_failed";
      }

      runtimeState.roundsWithoutTodo = usedTodo ? 0 : runtimeState.roundsWithoutTodo + 1;
    } finally {
      const stopHooks = await runHooks("Stop", {
        session_id: runtimeState.sessionId,
        trace_id: traceId,
        payload: {
          round: runtimeState.roundCounter,
          outcome: stopReason,
          tool_call_count: stopToolCallCount,
        },
      });
      appendSystemMessages(messages, stopHooks.messages);
    }
  }
}
