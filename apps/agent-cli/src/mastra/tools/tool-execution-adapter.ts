import type { AgentExecutionContext, ExecuteToolCommand, ToolDescriptor, ToolExecutionPort, ToolExecutionResult, ToolListContext } from "@orbit/runtime-contracts";
import { createTool, type Tool } from "@mastra/core/tools";
import type { ToolsInput } from "@mastra/core/agent";
import type { PublicSchema } from "@mastra/core/schema";
import { RequestContext } from "@mastra/core/request-context";

export const ORBIT_OWNER_ID_KEY = "orbitOwnerId";
export const ORBIT_EXECUTOR_KIND_KEY = "orbitExecutorKind";
export const ORBIT_PRODUCT_RUN_ID_KEY = "orbitProductRunId";
export const ORBIT_NODE_ID_KEY = "orbitNodeId";
export const ORBIT_SESSION_ID_KEY = "orbitSessionId";

type ToolHookContext = {
  descriptor: ToolDescriptor;
  command: ExecuteToolCommand;
};

type ToolAfterHookContext = ToolHookContext & {
  outcome: "succeeded" | "failed";
  auditId?: string;
  error?: unknown;
};

type AdapterHooks = {
  beforeExecute?: (context: ToolHookContext) => void | Promise<void>;
  afterExecute?: (context: ToolAfterHookContext) => void | Promise<void>;
};

type CachedTool = {
  descriptor: ToolDescriptor;
  serialized: string;
  tool: Tool;
};

function serializedDescriptor(descriptor: ToolDescriptor): string {
  return JSON.stringify({
    id: descriptor.id,
    name: descriptor.name,
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
    outputSchema: descriptor.outputSchema,
    source: descriptor.source,
    skillId: descriptor.skillId,
    skillVersion: descriptor.skillVersion,
    traits: descriptor.traits,
  });
}

function requiredContextText(value: unknown, key: string): string {
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`Mastra Tool request context 缺少 ${key}。`);
}

function executorKind(value: unknown): ExecuteToolCommand["executor"]["kind"] {
  return value === "workflow" || value === "direct" || value === "agent" ? value : "agent";
}

/** 将 Mastra Tool 调用委托给唯一 ToolExecutionPort，保留 Orbit 治理链路。 */
export class MastraToolExecutionAdapter implements ToolExecutionPort {
  private readonly cache = new Map<string, CachedTool>();

  constructor(
    private readonly port: ToolExecutionPort,
    private readonly hooks: AdapterHooks = {},
  ) {}

  list(context: ToolListContext): Promise<ToolDescriptor[]> {
    return this.port.list(context);
  }

  execute(command: ExecuteToolCommand): Promise<ToolExecutionResult> {
    return this.port.execute(command);
  }

  /** 为 Agent policy 解析允许的 descriptors，并生成稳定 Mastra Tool record。 */
  async resolveForAgent(command: AgentExecutionContext): Promise<ToolsInput> {
    const ownerId = typeof command.requestContext.ownerId === "string"
      ? command.requestContext.ownerId
      : command.resourceId;
    const descriptors = await this.list({
      ownerId,
      sessionId: command.sessionId,
      agentId: command.agentId,
      allowedToolIds: command.policy.allowedToolIds,
      allowedSkillIds: command.policy.allowedSkillIds,
    });
    const allowed = new Set(command.policy.allowedToolIds);
    return this.createTools(descriptors.filter((descriptor) => allowed.has(descriptor.id)));
  }

  /** 为 Workflow 或直接运行上下文解析 descriptors。 */
  async resolve(context: ToolListContext): Promise<ToolsInput> {
    return this.createTools(await this.list(context));
  }

  /** 在 Workflow step 中执行动态解析出的 Mastra Tool，同时保留 hooks 与唯一 ToolExecutionPort。 */
  async executeForWorkflow(input: {
    toolId: string;
    toolInput: unknown;
    ownerId: string;
    workflowId: string;
    runId: string;
    nodeId: string;
    requestContext?: Record<string, unknown>;
    abortSignal?: AbortSignal;
  }): Promise<unknown> {
    const tools = await this.resolve({
      ownerId: input.ownerId,
      workflowId: input.workflowId,
      allowedToolIds: [input.toolId],
    });
    const tool = tools[input.toolId] as Tool | undefined;
    if (!tool?.execute) throw new Error(`Workflow Tool ${input.toolId} 不存在或不可执行。`);
    const requestContext = new RequestContext();
    for (const [key, value] of Object.entries(input.requestContext ?? {})) requestContext.set(key, value);
    requestContext.set(ORBIT_OWNER_ID_KEY, input.ownerId);
    requestContext.set(ORBIT_EXECUTOR_KIND_KEY, "workflow");
    requestContext.set(ORBIT_PRODUCT_RUN_ID_KEY, input.runId);
    requestContext.set(ORBIT_NODE_ID_KEY, input.nodeId);
    return tool.execute(input.toolInput, {
      requestContext,
      abortSignal: input.abortSignal,
      observe: {
        span: async (_name, action) => action(),
        log: () => undefined,
      },
    });
  }

  getDescriptor(toolId: string): ToolDescriptor | null {
    return this.cache.get(toolId)?.descriptor ?? null;
  }

  private createTools(descriptors: ToolDescriptor[]): ToolsInput {
    return Object.fromEntries(descriptors.map((descriptor) => [descriptor.id, this.createTool(descriptor)]));
  }

  private createTool(descriptor: ToolDescriptor): Tool {
    const serialized = serializedDescriptor(descriptor);
    const current = this.cache.get(descriptor.id);
    if (current?.serialized === serialized) return current.tool;
    const tool = createTool({
      id: descriptor.id,
      description: descriptor.description,
      inputSchema: descriptor.inputSchema as PublicSchema<unknown>,
      outputSchema: descriptor.outputSchema as PublicSchema<unknown> | undefined,
      execute: async (input, context) => {
        const requestContext = context.requestContext;
        const ownerId = requiredContextText(requestContext.get(ORBIT_OWNER_ID_KEY), ORBIT_OWNER_ID_KEY);
        const kind = executorKind(requestContext.get(ORBIT_EXECUTOR_KIND_KEY));
        const runId = requestContext.get(ORBIT_PRODUCT_RUN_ID_KEY) as string | undefined;
        const nodeId = requestContext.get(ORBIT_NODE_ID_KEY) as string | undefined;
        const sessionId = requestContext.get(ORBIT_SESSION_ID_KEY) as string | undefined;
        const command: ExecuteToolCommand = {
          toolId: descriptor.id,
          input,
          ownerId,
          executor: { kind, runId, nodeId, sessionId },
          requestContext: requestContext.toJSON(),
          abortSignal: context.abortSignal,
        };
        await this.hooks.beforeExecute?.({ descriptor, command });
        try {
          const result = await this.port.execute(command);
          context.observe?.log("info", "Orbit Tool execution completed", {
            toolId: descriptor.id,
            auditId: result.auditId,
          });
          await this.hooks.afterExecute?.({
            descriptor,
            command,
            outcome: "succeeded",
            auditId: result.auditId,
          });
          return result.output;
        } catch (error) {
          await this.hooks.afterExecute?.({ descriptor, command, outcome: "failed", error });
          throw error;
        }
      },
    });
    this.cache.set(descriptor.id, { descriptor: structuredClone(descriptor), serialized, tool });
    return tool;
  }
}
