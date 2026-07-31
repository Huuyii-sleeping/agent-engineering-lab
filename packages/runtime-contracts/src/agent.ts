import type { RuntimeBinding, RuntimeEventBase } from "./common.js";

/** Agent 运行状态；终态不可逆。 */
export type AgentRunStatus = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";

/** Agent 模型用量的产品级规范化结构。 */
export type AgentUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
};

/** Agent 可消费的稳定消息输入。 */
export type AgentInputMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Agent Runtime 可执行的 Tool/Skill 白名单。 */
export type AgentExecutionPolicy = {
  allowedToolIds: string[];
  allowedSkillIds: string[];
};

/** Agent 执行所需的稳定产品上下文。 */
export type AgentExecutionContext = {
  agentId: string;
  agentVersion: string;
  sessionId: string;
  resourceId: string;
  threadId: string;
  messages: AgentInputMessage[];
  requestContext: Record<string, unknown>;
  policy: AgentExecutionPolicy;
  /** Agent Service 在 session 创建边界写入的可信不可变后端绑定。 */
  runtimeBinding?: RuntimeBinding;
  /** 创建前 capability gate 使用的可信产品能力要求。 */
  requiredRuntimeCapabilities?: string[];
};

/** 启动一次非流式 Agent 运行。 */
export type GenerateAgentCommand = AgentExecutionContext & {
  runId?: string;
};

/** 启动或从产品事件游标恢复一次 Agent 流订阅。 */
export type StreamAgentCommand = AgentExecutionContext & {
  runId?: string;
  sinceId?: number;
};

/** 取消仍在执行的 Agent run。 */
export type CancelAgentRunCommand = {
  runId: string;
  reason?: string;
};

/** Agent Tool 调用的稳定摘要。 */
export type AgentToolExecutionSummary = {
  callId: string;
  toolId: string;
  status: "succeeded" | "failed" | "cancelled";
  output?: unknown;
  error?: { code: string; message: string };
};

/** Agent run 的可查询快照。 */
export type AgentRunSnapshot = {
  id: string;
  status: AgentRunStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  sessionId: string;
  resourceId: string;
  threadId: string;
  binding: RuntimeBinding;
  usage?: AgentUsage;
  error?: { code: string; message: string; details?: Record<string, unknown> };
};

/** 非流式 Agent 运行的最终结果。 */
export type AgentRunResult = AgentRunSnapshot & {
  status: "succeeded" | "failed" | "cancelled";
  text: string;
  toolExecutions: AgentToolExecutionSummary[];
};

/** Agent 流式事件；不暴露 Mastra chunk。 */
export type AgentRuntimeEvent =
  | (RuntimeEventBase & { type: "run.status"; status: AgentRunStatus })
  | (RuntimeEventBase & { type: "text.delta"; delta: string })
  | (RuntimeEventBase & { type: "tool.input.delta"; callId: string; toolId: string; delta: string })
  | (RuntimeEventBase & { type: "tool.call"; callId: string; toolId: string; input: unknown })
  | (RuntimeEventBase & { type: "tool.result"; result: AgentToolExecutionSummary })
  | (RuntimeEventBase & { type: "usage"; usage: AgentUsage })
  | (RuntimeEventBase & { type: "run.final"; result: AgentRunResult });

/** Agent Adapter 对外声明的真实能力矩阵。 */
export type AgentRuntimeCapabilities = {
  generate: boolean;
  stream: boolean;
  eventReplay: boolean;
  runQuery: boolean;
  cancel: boolean;
  toolEvents: boolean;
  usage: boolean;
  sessionMemory: boolean;
};

/** 对话执行的框架无关端口。 */
export interface AgentRuntimePort {
  capabilities(): Promise<AgentRuntimeCapabilities>;
  generate(command: GenerateAgentCommand): Promise<AgentRunResult>;
  stream(command: StreamAgentCommand): AsyncIterable<AgentRuntimeEvent>;
  getRun(runId: string): Promise<AgentRunSnapshot | null>;
  cancel(command: CancelAgentRunCommand): Promise<AgentRunSnapshot>;
}
