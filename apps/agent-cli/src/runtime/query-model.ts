import OpenAI from "openai";
import { setTimeout as sleep } from "node:timers/promises";
import { buildPromptEnvelope } from "../prompt/builder.js";
import {
  classifyErrorForRecovery,
  classifyResponseForRecovery,
  createInitialRecoveryState,
  selectRecoveryDecision,
} from "../recovery.js";
import { COMPACT_THRESHOLD_TOKENS, estimateTokensFromMessages } from "../tools/context-compact.js";
import { tryQueryModelFallback } from "./query-model-fallback.js";
import {
  buildQueryModelRequestMessages,
  runQueryModelCompletionRequest,
  summarizeQueryModelText,
} from "./query-model-request.js";
import {
  appendQueryModelRecoveryFailure,
  applyQueryModelPreflightRecovery,
  compactQueryModelMessages,
  logQueryModelBackoff,
  logQueryModelContinuation,
  recordQueryModelRecoveryDecision,
} from "./query-model-recovery.js";
import type { QueryModelResult, RequestQueryModelOptions } from "./query-model-types.js";

export type { QueryModelResult } from "./query-model-types.js";

export async function requestQueryModel(opts: RequestQueryModelOptions): Promise<QueryModelResult> {
  const promptEnvelope = buildPromptEnvelope({
    ...opts.promptSource,
    memoryContext: opts.memoryContext,
    dynamicMessages: opts.dynamicSystemMessages,
  });

  let recoveryState = createInitialRecoveryState();
  let continuedAssistantContent = "";
  let continuationPrompt: string | null = null;
  let message: OpenAI.Chat.Completions.ChatCompletionMessage | null = null;

  while (!message) {
    const requestMessages = buildQueryModelRequestMessages(
      promptEnvelope,
      opts.messages,
      continuedAssistantContent,
      continuationPrompt,
    );
    const estimatedPromptTokens = estimateTokensFromMessages(requestMessages);
    if (estimatedPromptTokens > COMPACT_THRESHOLD_TOKENS) {
      const preflightResult = await applyQueryModelPreflightRecovery({
        messages: opts.messages,
        estimatedPromptTokens,
        thresholdTokens: COMPACT_THRESHOLD_TOKENS,
        recoveryState,
        round: opts.runtimeState.roundCounter,
        observabilityService: opts.observabilityService,
        traceId: opts.traceId,
      });
      recoveryState = preflightResult.recoveryState;
      if (!preflightResult.ok) {
        return { ok: false, stopReason: "recovery_failed" };
      }
      continue;
    }

    await opts.observabilityService.recordEvent(
      "model_request",
      {
        round: opts.runtimeState.roundCounter,
        messageCount: requestMessages.length,
        estimatedPromptTokens,
        latestUserInput: opts.latestUserInput ? summarizeQueryModelText(opts.latestUserInput) : "",
        recoveryState,
        continuedAssistantChars: continuedAssistantContent.length,
      },
      { traceId: opts.traceId },
    );

    const selection = await opts.modelPolicyService.selectModel("coding", opts.model, estimatedPromptTokens);
    await opts.observabilityService.recordEvent(
      "model_policy_selection",
      {
        role: selection.role,
        model: selection.model,
        fallbackModel: selection.fallbackModel,
        budgetAction: selection.budgetAction,
        budgetReason: selection.budgetReason,
        estimatedPromptCostUsd: selection.estimatedPromptCostUsd,
      },
      { traceId: opts.traceId },
    );
    if (selection.budgetAction === "deny") {
      opts.messages.push({
        role: "assistant",
        content: `Model request denied by budget policy: ${selection.budgetReason ?? "budget exceeded"}.`,
      });
      return { ok: false, stopReason: "model_budget_denied" };
    }

    const selectedModel = selection.model;
    try {
      const completion = await runQueryModelCompletionRequest({
        client: opts.client,
        model: selectedModel,
        messages: requestMessages,
        tools: opts.tools,
      });
      if (!completion) {
        await opts.observabilityService.recordEvent(
          "error",
          { phase: "model_response", message: "empty model response" },
          { traceId: opts.traceId },
        );
        return { ok: false, stopReason: "empty_model_response" };
      }

      await opts.observabilityService.recordEvent(
        "model_response",
        {
          round: opts.runtimeState.roundCounter,
          model: selectedModel,
          toolCallCount: completion.toolCallCount,
          completionTokens: completion.completionTokens,
          finishReason: completion.finishReason,
          content: completion.content ? summarizeQueryModelText(completion.content) : "",
        },
        { traceId: opts.traceId },
      );
      await opts.modelPolicyService.finalizeUsage(
        {
          role: "coding",
          model: selectedModel,
          promptTokens: estimatedPromptTokens,
          completionTokens: completion.completionTokens,
          latencyMs: completion.latencyMs,
          fallbackUsed: selection.budgetAction === "downgrade",
        },
        opts.traceId,
      );

      const recoverySignal = classifyResponseForRecovery({
        finishReason: completion.finishReason,
        toolCallCount: completion.toolCallCount,
        content: completion.content,
      });
      if (recoverySignal) {
        const decision = selectRecoveryDecision(recoverySignal, recoveryState);
        recoveryState = decision.nextState;
        await recordQueryModelRecoveryDecision({
          observabilityService: opts.observabilityService,
          traceId: opts.traceId,
          payload: {
            round: opts.runtimeState.roundCounter,
            action: decision.action,
            reason: decision.reason,
            detail: decision.detail,
            state: recoveryState,
            finishReason: completion.finishReason,
          },
        });
        if (decision.action === "continue") {
          continuedAssistantContent += completion.content;
          continuationPrompt = decision.prompt;
          logQueryModelContinuation(recoveryState);
          continue;
        }
        await appendQueryModelRecoveryFailure({
          messages: opts.messages,
          observabilityService: opts.observabilityService,
          traceId: opts.traceId,
          phase: "model_response",
          decision,
        });
        return { ok: false, stopReason: "recovery_failed" };
      }

      message = continuedAssistantContent
        ? ({
            ...completion.message,
            content: `${continuedAssistantContent}${completion.content}`,
          } as OpenAI.Chat.Completions.ChatCompletionMessage)
        : completion.message;
    } catch (error) {
      const fallbackMessage = await tryQueryModelFallback({
        error,
        client: opts.client,
        defaultModel: opts.model,
        selectedModel,
        estimatedPromptTokens,
        requestMessages,
        tools: opts.tools,
        continuedAssistantContent,
        modelPolicyService: opts.modelPolicyService,
        observabilityService: opts.observabilityService,
        traceId: opts.traceId,
      });
      if (fallbackMessage) {
        message = fallbackMessage;
        continue;
      }

      const decision = selectRecoveryDecision(classifyErrorForRecovery(error), recoveryState);
      recoveryState = decision.nextState;
      await recordQueryModelRecoveryDecision({
        observabilityService: opts.observabilityService,
        traceId: opts.traceId,
        payload: {
          round: opts.runtimeState.roundCounter,
          action: decision.action,
          reason: decision.reason,
          detail: decision.detail,
          state: recoveryState,
        },
      });
      if (decision.action === "compact") {
        await compactQueryModelMessages(opts.messages, "recovery compact");
        continue;
      }
      if (decision.action === "backoff") {
        logQueryModelBackoff(decision, recoveryState);
        await sleep(decision.delayMs);
        continue;
      }
      await appendQueryModelRecoveryFailure({
        messages: opts.messages,
        observabilityService: opts.observabilityService,
        traceId: opts.traceId,
        phase: "model_request",
        decision,
      });
      return { ok: false, stopReason: "recovery_failed" };
    }
  }

  return {
    ok: true,
    message,
  };
}
