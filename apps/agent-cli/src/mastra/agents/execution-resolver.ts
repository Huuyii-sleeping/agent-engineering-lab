import type { AgentExecutionContext, AgentInputMessage, AgentUsage } from "@orbit/runtime-contracts";
import type { Agent, ToolsInput } from "@mastra/core/agent";
import type { MastraMemory } from "@mastra/core/memory";
import {
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
  RequestContext,
} from "@mastra/core/request-context";
import { resolveOpenAiBaseUrl } from "../../config.js";
import { buildPromptEnvelope } from "../../prompt/builder.js";
import type { StaticPromptSource } from "../../prompt/types.js";
import type { ModelPolicyServiceLike } from "../../services/model-policy-service.js";
import { MastraAgentDefinitionRegistry } from "./definition-registry.js";
import {
  ORBIT_EXECUTOR_KIND_KEY,
  ORBIT_OWNER_ID_KEY,
  ORBIT_SESSION_ID_KEY,
} from "../tools/tool-execution-adapter.js";

export type MastraAgentChunk = {
  type: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

export type MastraAgentGenerateOutput = {
  runId?: string;
  text: string;
  finishReason?: string;
  totalUsage: AgentUsage;
  toolCalls: unknown[];
  toolResults: unknown[];
  error?: Error;
  tripwire?: { reason: string; metadata?: unknown };
};

export type MastraAgentStreamOutput = {
  runId: string;
  fullStream: AsyncIterable<MastraAgentChunk>;
  text: Promise<string>;
  finishReason: Promise<string | undefined>;
  totalUsage: Promise<AgentUsage>;
  error?: Error;
  tripwire?: { reason: string; metadata?: unknown };
};

export type MastraAgentExecutionOptions = {
  runId: string;
  abortSignal: AbortSignal;
  requestContext: RequestContext;
  activeTools: string[];
  memory?: { resource: string; thread: string };
};

/** Adapter 使用的最小 Mastra Agent 执行面，便于共享 contract harness 注入确定性执行器。 */
export type MastraAgentExecutor = {
  generate(messages: AgentInputMessage[], options: MastraAgentExecutionOptions): Promise<MastraAgentGenerateOutput>;
  stream(messages: AgentInputMessage[], options: MastraAgentExecutionOptions): Promise<MastraAgentStreamOutput>;
  abortRunStream(runId: string): boolean;
};

export type MastraAgentResolution = {
  executor: MastraAgentExecutor;
  executionOptions: Omit<MastraAgentExecutionOptions, "runId" | "abortSignal">;
  finalizeUsage(usage: AgentUsage, latencyMs: number): Promise<void>;
};

export type MastraAgentMemoryIdentity = {
  mastraResourceId: string;
  mastraThreadId: string;
};

export interface MastraAgentExecutionResolver {
  readonly sessionMemory: boolean;
  resolve(command: AgentExecutionContext, identity: MastraAgentMemoryIdentity): Promise<MastraAgentResolution>;
}

type ResolverOptions = {
  registry: MastraAgentDefinitionRegistry;
  modelPolicyService: ModelPolicyServiceLike;
  defaultModel: string;
  promptSource: StaticPromptSource;
  resolveTools?: (command: AgentExecutionContext) => Promise<ToolsInput>;
  resolveSkillInstructions?: (command: AgentExecutionContext) => Promise<string[]>;
  memory?: MastraMemory;
  baseUrl?: string;
  apiKey?: string;
};

function estimateTokens(values: string[]): number {
  return Math.max(1, Math.ceil(values.join("\n").length / 4));
}

function asExecutor(agent: Agent): MastraAgentExecutor {
  return {
    async generate(messages, options) {
      const output = await agent.generate(messages as never, options);
      return {
        runId: output.runId,
        text: output.text,
        finishReason: output.finishReason,
        totalUsage: output.totalUsage,
        toolCalls: output.toolCalls,
        toolResults: output.toolResults,
        error: output.error,
        tripwire: output.tripwire,
      };
    },
    async stream(messages, options) {
      const output = await agent.stream(messages as never, options);
      return {
        runId: output.runId,
        fullStream: output.fullStream as unknown as AsyncIterable<MastraAgentChunk>,
        text: output.text,
        finishReason: output.finishReason,
        totalUsage: output.totalUsage,
        error: output.error,
        tripwire: output.tripwire,
      };
    },
    abortRunStream(runId) {
      return agent.abortRunStream(runId);
    },
  };
}

/** 复用 Orbit model policy、prompt builder 与 Tool/Skill 解析结果装配 Mastra Agent。 */
export class OrbitMastraAgentExecutionResolver implements MastraAgentExecutionResolver {
  readonly sessionMemory: boolean;

  constructor(private readonly options: ResolverOptions) {
    this.sessionMemory = Boolean(options.memory);
  }

  async resolve(
    command: AgentExecutionContext,
    identity: MastraAgentMemoryIdentity,
  ): Promise<MastraAgentResolution> {
    const [tools, skillInstructions] = await Promise.all([
      this.options.resolveTools?.(command) ?? Promise.resolve({}),
      this.options.resolveSkillInstructions?.(command) ?? Promise.resolve([]),
    ]);
    const envelope = buildPromptEnvelope({
      ...this.options.promptSource,
      skills: [...this.options.promptSource.skills, ...skillInstructions],
    });
    const instructions = [envelope.primarySystemPrompt, ...envelope.supplementalSystemMessages].filter(Boolean);
    const estimatedPromptTokens = estimateTokens([
      ...instructions,
      ...command.messages.map((message) => message.content),
    ]);
    const selection = await this.options.modelPolicyService.selectModel(
      "coding",
      this.options.defaultModel,
      estimatedPromptTokens,
    );
    const registered = this.options.registry.resolve({
      agentId: command.agentId,
      agentVersion: command.agentVersion,
      name: command.agentId,
      instructions,
      model: {
        providerId: "openai",
        modelId: selection.model,
        url: this.options.baseUrl ?? resolveOpenAiBaseUrl(),
        apiKey: this.options.apiKey ?? process.env.OPENAI_API_KEY,
      },
      tools,
      toolIds: command.policy.allowedToolIds,
      skillIds: command.policy.allowedSkillIds,
      memory: this.options.memory,
    });
    const requestContext = new RequestContext();
    for (const [key, value] of Object.entries(command.requestContext)) requestContext.set(key, value);
    requestContext.set("orbitAgentId", command.agentId);
    requestContext.set("orbitAgentVersion", command.agentVersion);
    requestContext.set(ORBIT_OWNER_ID_KEY, typeof command.requestContext.ownerId === "string"
      ? command.requestContext.ownerId
      : command.resourceId);
    requestContext.set(ORBIT_EXECUTOR_KIND_KEY, "agent");
    requestContext.set(ORBIT_SESSION_ID_KEY, command.sessionId);
    requestContext.set(MASTRA_RESOURCE_ID_KEY, identity.mastraResourceId);
    requestContext.set(MASTRA_THREAD_ID_KEY, identity.mastraThreadId);
    const activeTools = command.policy.allowedToolIds.filter((toolId) => toolId in tools);

    return {
      executor: asExecutor(registered.agent),
      executionOptions: {
        requestContext,
        activeTools,
        memory: this.sessionMemory
          ? { resource: identity.mastraResourceId, thread: identity.mastraThreadId }
          : undefined,
      },
      finalizeUsage: async (usage, latencyMs) => {
        await this.options.modelPolicyService.finalizeUsage({
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          model: selection.model,
          role: "coding",
          latencyMs,
          fallbackUsed: selection.model !== this.options.defaultModel,
        });
      },
    };
  }
}
