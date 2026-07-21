import type OpenAI from "openai";
import type { LlmNodeConfig } from "@orbit/workflow-core";
import type { ModelPolicyServiceLike } from "../../services/model-policy-service.js";
import type { WorkflowNodeExecutor } from "../executor-registry.js";

/** LLM executor 使用的模型服务边界。 */
export type WorkflowLlmService = {
  complete(input: {
    model: string;
    systemPrompt?: string;
    prompt: string;
    temperature?: number;
    signal: AbortSignal;
    onDelta(delta: string): void;
  }): Promise<{ text: string; usage: { promptTokens: number; completionTokens: number } }>;
};

/** 复用 OpenAI 客户端和现有模型预算策略的流式服务。 */
export class OpenAIWorkflowLlmService implements WorkflowLlmService {
  constructor(private readonly client: OpenAI, private readonly modelPolicy: ModelPolicyServiceLike) {}

  async complete(input: Parameters<WorkflowLlmService["complete"]>[0]) {
    const estimatedPromptTokens = Math.max(1, Math.ceil(`${input.systemPrompt ?? ""}${input.prompt}`.length / 4));
    const selection = await this.modelPolicy.selectModel("coding", input.model, estimatedPromptTokens);
    if (selection.budgetAction === "deny") throw new Error(`模型预算拒绝执行：${selection.budgetReason ?? "budget denied"}`);
    const startedAt = Date.now();
    const stream = await this.client.chat.completions.create({
      model: selection.model,
      messages: [
        ...(input.systemPrompt ? [{ role: "system" as const, content: input.systemPrompt }] : []),
        { role: "user" as const, content: input.prompt },
      ],
      temperature: input.temperature,
      stream: true,
      stream_options: { include_usage: true },
    }, { signal: input.signal });
    let text = "";
    let promptTokens = estimatedPromptTokens;
    let completionTokens = 0;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        text += delta;
        input.onDelta(delta);
      }
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
      }
    }
    await this.modelPolicy.finalizeUsage({ promptTokens, completionTokens, model: selection.model, role: "coding", latencyMs: Date.now() - startedAt, fallbackUsed: selection.model !== input.model });
    return { text, usage: { promptTokens, completionTokens } };
  }
}

/** LLM 节点执行器。 */
export class LlmWorkflowExecutor implements WorkflowNodeExecutor {
  readonly identity = { id: "workflow.llm", version: 1 } as const;
  constructor(private readonly service: WorkflowLlmService) {}

  async execute(context: Parameters<WorkflowNodeExecutor["execute"]>[0]) {
    const config = context.node.config as LlmNodeConfig;
    const prompt = String(await context.variables.resolveValue(config.prompt) ?? "");
    const result = await this.service.complete({ ...config, prompt, signal: context.signal, onDelta: context.emitDelta });
    return { outputs: { text: result.text, usage: result.usage } };
  }
}
