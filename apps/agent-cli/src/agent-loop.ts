import OpenAI from "openai";
import { setTimeout as sleep } from "node:timers/promises";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { runHooks } from "./hooks/index.js";
import { toAssistantMessage } from "./messages.js";
import { createSpanId, createTraceId, recordObservabilityEvent, withExecutionContext } from "./observability/runtime.js";
import { buildPromptEnvelope } from "./prompt/builder.js";
import type { StaticPromptSource } from "./prompt/types.js";
import { appendSystemMessages } from "./runtime/query-messages.js";
import { prepareQueryRound } from "./runtime/query-preparation.js";
import {
  analyzeToolOutput,
  isTodoCompletionRequest,
  markWriteSideEffect,
  parseTaskIdFromToolOutput,
} from "./runtime/query-tool-results.js";
import { runDeliveryValidation } from "./delivery.js";
import { classifyFallbackableError, MODEL_POLICY } from "./model-policy.js";
import { RUNTIME_CONFIG } from "./runtime-config.js";
import {
  classifyErrorForRecovery,
  classifyResponseForRecovery,
  createInitialRecoveryState,
  formatRecoveryFailure,
  makePromptTooLongSignal,
  selectRecoveryDecision,
} from "./recovery.js";
import { COMPACT_THRESHOLD_TOKENS, compactMessages, estimateTokensFromMessages } from "./tools/context-compact.js";
import { previewToolCall, runToolByName } from "./tools/index.js";

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

  const parseArgs = (raw: string): Record<string, unknown> => {
    try {
      return JSON.parse(raw || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
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
      const preparedRound = await prepareQueryRound({
        runtimeState,
        traceId,
        latestUserInput: latestUser?.content ?? "",
      });
      if (!preparedRound.ok) {
        stopReason = "session_start_blocked";
        messages.push({
          role: "assistant",
          content: `Current round blocked by hook: ${preparedRound.blockedReason}`,
        });
        return;
      }
      const promptEnvelope = buildPromptEnvelope({
        ...promptSource,
        memoryContext: preparedRound.memoryContext,
        dynamicMessages: preparedRound.dynamicSystemMessages,
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

        const selection = await MODEL_POLICY.selectModel("coding", model, estimatedPromptTokens);
        await recordObservabilityEvent(
          "model_policy_selection",
          {
            role: selection.role,
            model: selection.model,
            fallbackModel: selection.fallbackModel,
            budgetAction: selection.budgetAction,
            budgetReason: selection.budgetReason,
            estimatedPromptCostUsd: selection.estimatedPromptCostUsd,
          },
          { traceId },
        );
        if (selection.budgetAction === "deny") {
          stopReason = "model_budget_denied";
          messages.push({
            role: "assistant",
            content: `Model request denied by budget policy: ${selection.budgetReason ?? "budget exceeded"}.`,
          });
          return;
        }
        const selectedModel = selection.model;
        try {
          const startedAt = Date.now();
          const response = await client.chat.completions.create({
            model: selectedModel,
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
              model: selectedModel,
              toolCallCount,
              completionTokens: response.usage?.completion_tokens ?? 0,
              finishReason,
              content: content ? summarizeText(content) : "",
            },
            { traceId },
          );
          await MODEL_POLICY.finalizeUsage(
            {
              role: "coding",
              model: selectedModel,
              promptTokens: estimatedPromptTokens,
              completionTokens: response.usage?.completion_tokens ?? 0,
              latencyMs: Date.now() - startedAt,
              fallbackUsed: selection.budgetAction === "downgrade",
            },
            traceId,
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
          if (classifyFallbackableError(error)) {
            const fallbackSelection = await MODEL_POLICY.selectFallbackModel("coding", model, estimatedPromptTokens, selectedModel);
            if (fallbackSelection) {
              try {
                const retryStartedAt = Date.now();
                const retryResponse = await client.chat.completions.create({
                  model: fallbackSelection.model,
                  messages: requestMessages,
                  tools,
                  max_tokens: 8_000,
                });
                const retryCandidate = retryResponse.choices[0]?.message;
                if (retryCandidate) {
                  const retryContent = typeof retryCandidate.content === "string" ? retryCandidate.content : "";
                  await recordObservabilityEvent(
                    "model_policy_selection",
                    {
                      role: fallbackSelection.role,
                      model: fallbackSelection.model,
                      fallbackModel: null,
                      budgetAction: "downgrade",
                      budgetReason: "request_fallback",
                    },
                    { traceId },
                  );
                  await MODEL_POLICY.finalizeUsage(
                    {
                      role: "coding",
                      model: fallbackSelection.model,
                      promptTokens: estimatedPromptTokens,
                      completionTokens: retryResponse.usage?.completion_tokens ?? 0,
                      latencyMs: Date.now() - retryStartedAt,
                      fallbackUsed: true,
                    },
                    traceId,
                  );
                  message = {
                    ...retryCandidate,
                    content: continuedAssistantContent ? `${continuedAssistantContent}${retryContent}` : retryContent,
                  } as OpenAI.Chat.Completions.ChatCompletionMessage;
                  continue;
                }
              } catch {
                // continue to recovery selector below
              }
            }
          }
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
            markWriteSideEffect(runtimeState, toolCall.function.name, toolArgs);
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

          if (runtimeState.activeTaskId && isTodoCompletionRequest(toolArgs)) {
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
          const createdId = parseTaskIdFromToolOutput(toolOutput);
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
