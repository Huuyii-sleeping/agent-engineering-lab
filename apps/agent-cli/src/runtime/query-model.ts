import OpenAI from "openai";
import { setTimeout as sleep } from "node:timers/promises";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { AgentRuntimeState } from "../agent-loop.js";
import { classifyFallbackableError } from "../model-policy.js";
import type { ModelPolicyServiceLike, ObservabilityServiceLike } from "../services/index.js";
import { buildPromptEnvelope } from "../prompt/builder.js";
import type { StaticPromptSource } from "../prompt/types.js";
import {
  classifyErrorForRecovery,
  classifyResponseForRecovery,
  createInitialRecoveryState,
  formatRecoveryFailure,
  makePromptTooLongSignal,
  selectRecoveryDecision,
} from "../recovery.js";
import { COMPACT_THRESHOLD_TOKENS, compactMessages, estimateTokensFromMessages } from "../tools/context-compact.js";

export type QueryModelResult =
  | {
      ok: true;
      message: OpenAI.Chat.Completions.ChatCompletionMessage;
    }
  | {
      ok: false;
      stopReason: "empty_model_response" | "model_budget_denied" | "recovery_failed";
    };

type RequestQueryModelOptions = {
  client: OpenAI;
  model: string;
  promptSource: StaticPromptSource;
  tools: ChatCompletionTool[];
  messages: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  traceId: string;
  latestUserInput: string;
  memoryContext: string | null;
  dynamicSystemMessages: string[];
  modelPolicyService: ModelPolicyServiceLike;
  observabilityService: ObservabilityServiceLike;
};

function summarizeText(value: string, max = 160): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}...`;
}

async function appendRecoveryFailure(
  messages: ChatCompletionMessageParam[],
  observabilityService: ObservabilityServiceLike,
  traceId: string,
  phase: "model_request" | "model_response",
  decision: { reason: string; detail: string },
): Promise<void> {
  const failure = formatRecoveryFailure({
    action: "fail",
    reason: decision.reason,
    detail: decision.detail,
    nextState: createInitialRecoveryState(),
  });
  await observabilityService.recordEvent("error", { phase, message: failure }, { traceId });
  messages.push({ role: "assistant", content: failure });
}

export async function requestQueryModel(opts: RequestQueryModelOptions): Promise<QueryModelResult> {
  const promptEnvelope = buildPromptEnvelope({
    ...opts.promptSource,
    memoryContext: opts.memoryContext,
    dynamicMessages: opts.dynamicSystemMessages,
  });
  const buildRequestMessages = (continuedAssistantContent: string, continuationPrompt: string | null) => {
    const requestMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: promptEnvelope.primarySystemPrompt },
      ...promptEnvelope.supplementalSystemMessages.map(
        (content) => ({ role: "system", content }) satisfies ChatCompletionMessageParam,
      ),
      ...opts.messages,
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
      await opts.observabilityService.recordEvent(
        "recovery_decision",
        {
          round: opts.runtimeState.roundCounter,
          action: decision.action,
          reason: decision.reason,
          detail: decision.detail,
          state: recoveryState,
          estimatedPromptTokens,
        },
        { traceId: opts.traceId },
      );
      if (decision.action !== "compact") {
        await appendRecoveryFailure(opts.messages, opts.observabilityService, opts.traceId, "model_request", decision);
        return { ok: false, stopReason: "recovery_failed" };
      }
      const compactResult = await compactMessages({ messages: opts.messages }, "auto");
      console.log(
        `\u001b[36m[auto compact]\u001b[0m before=${compactResult.estimatedBefore} after=${compactResult.estimatedAfter} snapshot=${compactResult.transcriptPath}`,
      );
      continue;
    }

    await opts.observabilityService.recordEvent(
      "model_request",
      {
        round: opts.runtimeState.roundCounter,
        messageCount: requestMessages.length,
        estimatedPromptTokens,
        latestUserInput: opts.latestUserInput ? summarizeText(opts.latestUserInput) : "",
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
      const startedAt = Date.now();
      const response = await opts.client.chat.completions.create({
        model: selectedModel,
        messages: requestMessages,
        tools: opts.tools,
        max_tokens: 8_000,
      });

      const candidate = response.choices[0]?.message;
      if (!candidate) {
        await opts.observabilityService.recordEvent(
          "error",
          { phase: "model_response", message: "empty model response" },
          { traceId: opts.traceId },
        );
        return { ok: false, stopReason: "empty_model_response" };
      }

      const toolCallCount = candidate.tool_calls?.length ?? 0;
      const content = typeof candidate.content === "string" ? candidate.content : "";
      const finishReason = response.choices[0]?.finish_reason ?? null;
      await opts.observabilityService.recordEvent(
        "model_response",
        {
          round: opts.runtimeState.roundCounter,
          model: selectedModel,
          toolCallCount,
          completionTokens: response.usage?.completion_tokens ?? 0,
          finishReason,
          content: content ? summarizeText(content) : "",
        },
        { traceId: opts.traceId },
      );
      await opts.modelPolicyService.finalizeUsage(
        {
          role: "coding",
          model: selectedModel,
          promptTokens: estimatedPromptTokens,
          completionTokens: response.usage?.completion_tokens ?? 0,
          latencyMs: Date.now() - startedAt,
          fallbackUsed: selection.budgetAction === "downgrade",
        },
        opts.traceId,
      );

      const recoverySignal = classifyResponseForRecovery({
        finishReason,
        toolCallCount,
        content,
      });
      if (recoverySignal) {
        const decision = selectRecoveryDecision(recoverySignal, recoveryState);
        recoveryState = decision.nextState;
        await opts.observabilityService.recordEvent(
          "recovery_decision",
          {
            round: opts.runtimeState.roundCounter,
            action: decision.action,
            reason: decision.reason,
            detail: decision.detail,
            state: recoveryState,
            finishReason,
          },
          { traceId: opts.traceId },
        );
        if (decision.action === "continue") {
          continuedAssistantContent += content;
          continuationPrompt = decision.prompt;
          console.log(`\u001b[36m[recovery continue]\u001b[0m attempts=${recoveryState.continuationAttempts}`);
          continue;
        }
        await appendRecoveryFailure(opts.messages, opts.observabilityService, opts.traceId, "model_response", decision);
        return { ok: false, stopReason: "recovery_failed" };
      }

      message = continuedAssistantContent
        ? ({
            ...candidate,
            content: `${continuedAssistantContent}${content}`,
          } as OpenAI.Chat.Completions.ChatCompletionMessage)
        : candidate;
    } catch (error) {
      if (classifyFallbackableError(error)) {
        const fallbackSelection = await opts.modelPolicyService.selectFallbackModel(
          "coding",
          opts.model,
          estimatedPromptTokens,
          selectedModel,
        );
        if (fallbackSelection) {
          try {
            const retryStartedAt = Date.now();
            const retryResponse = await opts.client.chat.completions.create({
              model: fallbackSelection.model,
              messages: requestMessages,
              tools: opts.tools,
              max_tokens: 8_000,
            });
            const retryCandidate = retryResponse.choices[0]?.message;
            if (retryCandidate) {
              const retryContent = typeof retryCandidate.content === "string" ? retryCandidate.content : "";
              await opts.observabilityService.recordEvent(
                "model_policy_selection",
                {
                  role: fallbackSelection.role,
                  model: fallbackSelection.model,
                  fallbackModel: null,
                  budgetAction: "downgrade",
                  budgetReason: "request_fallback",
                },
                { traceId: opts.traceId },
              );
              await opts.modelPolicyService.finalizeUsage(
                {
                  role: "coding",
                  model: fallbackSelection.model,
                  promptTokens: estimatedPromptTokens,
                  completionTokens: retryResponse.usage?.completion_tokens ?? 0,
                  latencyMs: Date.now() - retryStartedAt,
                  fallbackUsed: true,
                },
                opts.traceId,
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
      await opts.observabilityService.recordEvent(
        "recovery_decision",
        {
          round: opts.runtimeState.roundCounter,
          action: decision.action,
          reason: decision.reason,
          detail: decision.detail,
          state: recoveryState,
        },
        { traceId: opts.traceId },
      );
      if (decision.action === "compact") {
        const compactResult = await compactMessages({ messages: opts.messages }, "auto");
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
      await appendRecoveryFailure(opts.messages, opts.observabilityService, opts.traceId, "model_request", decision);
      return { ok: false, stopReason: "recovery_failed" };
    }
  }

  return {
    ok: true,
    message,
  };
}
