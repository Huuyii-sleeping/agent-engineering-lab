import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { MODEL, createClient } from "../config.js";
import { classifyFallbackableError } from "../model-policy.js";
import {
  DEFAULT_MODEL_POLICY_SERVICE,
  type ModelPolicyServiceLike,
} from "../services/model-policy-service.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import { toAssistantMessage } from "../messages.js";
import { BASE_TOOLS, runBaseToolByName } from "./base.js";
import type { SubagentExecutionResult } from "./subagent-types.js";

type ClientFactory = typeof createClient;
type BaseToolRunner = typeof runBaseToolByName;

export type SubagentExecutorLike = {
  execute(prompt: string, traceId?: string): Promise<SubagentExecutionResult>;
};

export class SubagentExecutor implements SubagentExecutorLike {
  private client: ReturnType<typeof createClient> | null = null;

  constructor(
    private readonly clientFactory: ClientFactory = createClient,
    private readonly modelPolicyService: ModelPolicyServiceLike = DEFAULT_MODEL_POLICY_SERVICE,
    private readonly tools: ChatCompletionTool[] = BASE_TOOLS,
    private readonly runTool: BaseToolRunner = runBaseToolByName,
  ) {}

  private getClient(): ReturnType<typeof createClient> {
    if (!this.client) {
      this.client = this.clientFactory();
    }
    return this.client;
  }

  async execute(prompt: string, traceId?: string): Promise<SubagentExecutionResult> {
    try {
      const client = this.getClient();
      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content:
            "You are a focused worker agent. Use tools when needed and return concise factual results.",
        },
        { role: "user", content: prompt },
      ];

      for (let round = 0; round < RUNTIME_CONFIG.subagentMaxRounds; round += 1) {
        const promptTokens = Math.ceil(JSON.stringify(messages).length / 4);
        const selection = await this.modelPolicyService.selectModel("ops", MODEL, promptTokens);
        if (selection.budgetAction === "deny") {
          return {
            status: "failed",
            error: `MODEL_BUDGET_DENIED:${selection.budgetReason ?? "budget exceeded"}`,
          };
        }

        const startedAt = Date.now();
        let modelUsed = selection.model;
        let fallbackUsed = selection.budgetAction === "downgrade";
        let response;

        try {
          response = await client.chat.completions.create({
            model: selection.model,
            messages,
            tools: this.tools,
            max_tokens: RUNTIME_CONFIG.subagentMaxTokens,
          });
        } catch (error) {
          if (selection.fallbackModel && classifyFallbackableError(error)) {
            modelUsed = selection.fallbackModel;
            fallbackUsed = true;
            response = await client.chat.completions.create({
              model: modelUsed,
              messages,
              tools: this.tools,
              max_tokens: RUNTIME_CONFIG.subagentMaxTokens,
            });
          } else {
            throw error;
          }
        }

        const message = response.choices[0]?.message;
        if (!message) {
          break;
        }

        await this.modelPolicyService.finalizeUsage(
          {
            role: "ops",
            model: modelUsed,
            promptTokens,
            completionTokens: response.usage?.completion_tokens ?? 0,
            latencyMs: Date.now() - startedAt,
            fallbackUsed,
          },
          traceId,
        );

        messages.push(toAssistantMessage(message));

        const functionToolCalls = message.tool_calls?.filter(
          (toolCall): toolCall is ChatCompletionMessageFunctionToolCall =>
            toolCall.type === "function",
        );

        if (!functionToolCalls || functionToolCalls.length === 0) {
          return {
            status: "completed",
            output: message.content ?? "",
          };
        }

        for (const toolCall of functionToolCalls) {
          const toolOutput = await this.runTool(
            toolCall.function.name,
            toolCall.function.arguments,
          );
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolOutput,
          });
        }
      }

      return { status: "failed", error: "SUBAGENT_MAX_ROUNDS_EXCEEDED" };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
