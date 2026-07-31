import type { LlmNodeConfig } from "@orbit/workflow-core";
import type { AgentUsage } from "@orbit/runtime-contracts";
import { RequestContext } from "@mastra/core/request-context";
import { resolveOpenAiBaseUrl } from "../../config.js";
import type { ModelPolicyServiceLike } from "../../services/model-policy-service.js";
import { MastraAgentDefinitionRegistry } from "../agents/definition-registry.js";
import {
  ORBIT_EXECUTOR_KIND_KEY,
  ORBIT_NODE_ID_KEY,
  ORBIT_OWNER_ID_KEY,
  ORBIT_PRODUCT_RUN_ID_KEY,
} from "../tools/tool-execution-adapter.js";
import type { MastraWorkflowAgentResolver } from "./agent-executor.js";

type ResolverOptions = {
  registry: MastraAgentDefinitionRegistry;
  modelPolicyService: ModelPolicyServiceLike;
  baseUrl?: string;
  apiKey?: string;
};

function estimateTokens(input: string): number {
  return Math.max(1, Math.ceil(input.length / 4));
}

function textDelta(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return "";
  const payload = (chunk as { payload?: unknown }).payload;
  if (!payload || typeof payload !== "object") return "";
  const text = (payload as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
}

/** 复用 model policy 与共享 Agent registry 解析 Workflow LLM 节点。 */
export class OrbitMastraWorkflowAgentResolver implements MastraWorkflowAgentResolver {
  constructor(private readonly options: ResolverOptions) {}

  async stream(input: Parameters<MastraWorkflowAgentResolver["stream"]>[0]) {
    const config = input.node.config as LlmNodeConfig;
    const selection = await this.options.modelPolicyService.selectModel(
      "coding",
      config.model,
      estimateTokens(`${config.systemPrompt ?? ""}\n${input.prompt}`),
    );
    if (selection.budgetAction === "deny") {
      throw new Error(`模型预算拒绝执行：${selection.budgetReason ?? "budget denied"}`);
    }
    const registered = this.options.registry.resolve({
      agentId: `workflow:${input.workflowId}:${input.node.id}`,
      agentVersion: String(input.node.nodeVersion),
      name: input.node.label,
      instructions: config.systemPrompt ? [config.systemPrompt] : ["Execute this workflow LLM step."],
      model: {
        providerId: "openai",
        modelId: selection.model,
        url: this.options.baseUrl ?? resolveOpenAiBaseUrl(),
        apiKey: this.options.apiKey ?? process.env.OPENAI_API_KEY,
      },
      tools: {},
      toolIds: [],
      skillIds: [],
    });
    const requestContext = new RequestContext();
    for (const [key, value] of Object.entries(input.requestContext)) requestContext.set(key, value);
    requestContext.set(ORBIT_EXECUTOR_KIND_KEY, "workflow");
    requestContext.set(ORBIT_PRODUCT_RUN_ID_KEY, input.runId);
    requestContext.set(ORBIT_NODE_ID_KEY, input.node.id);
    if (typeof input.requestContext.ownerId === "string") {
      requestContext.set(ORBIT_OWNER_ID_KEY, input.requestContext.ownerId);
    }
    const startedAt = Date.now();
    const output = await registered.agent.stream(input.prompt, {
      runId: `${input.runId}:${input.node.id}`,
      abortSignal: input.signal,
      requestContext,
      activeTools: [],
      modelSettings: config.temperature === undefined ? undefined : { temperature: config.temperature },
    });
    for await (const chunk of output.fullStream) {
      const delta = textDelta(chunk);
      if (delta) input.onDelta(delta);
    }
    const [text, usage] = await Promise.all([output.text, output.totalUsage]);
    const normalized = usage as AgentUsage;
    await this.options.modelPolicyService.finalizeUsage({
      promptTokens: normalized.inputTokens ?? 0,
      completionTokens: normalized.outputTokens ?? 0,
      model: selection.model,
      role: "coding",
      latencyMs: Date.now() - startedAt,
      fallbackUsed: selection.model !== config.model,
    });
    return { text, usage: normalized };
  }
}
