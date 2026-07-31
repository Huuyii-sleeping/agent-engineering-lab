/** Tool JSON Schema 的框架无关表示。 */
export type ToolSchema = Record<string, unknown>;

/** Tool 的稳定执行特征。 */
export type ToolExecutionTraits = {
  readOnly: boolean;
  idempotent: boolean;
  cancellable: boolean;
  sideEffecting: boolean;
};

/** Agent、Workflow 和直接 API 共享的 Tool 描述。 */
export type ToolDescriptor = {
  id: string;
  name: string;
  description: string;
  inputSchema: ToolSchema;
  outputSchema?: ToolSchema;
  source: "builtin" | "skill" | "mcp" | "custom";
  skillId?: string;
  skillVersion?: string;
  traits: ToolExecutionTraits;
};

/** Tool 列表解析所需的调用者和绑定上下文。 */
export type ToolListContext = {
  ownerId: string;
  sessionId?: string;
  agentId?: string;
  workflowId?: string;
  allowedToolIds?: string[];
  allowedSkillIds?: string[];
};

/** Tool 调用的稳定执行身份。 */
export type ToolExecutorIdentity = {
  kind: "agent" | "workflow" | "direct";
  runId?: string;
  nodeId?: string;
  sessionId?: string;
};

/** 执行一次 Tool 调用。 */
export type ExecuteToolCommand = {
  toolId: string;
  input: unknown;
  ownerId: string;
  executor: ToolExecutorIdentity;
  requestContext: Record<string, unknown>;
  abortSignal?: AbortSignal;
};

/** Tool 执行完成后的规范化结果。 */
export type ToolExecutionResult = {
  toolId: string;
  output: unknown;
  startedAt: number;
  finishedAt: number;
  auditId?: string;
};

/** Tool 列表和执行的统一治理端口。 */
export interface ToolExecutionPort {
  list(context: ToolListContext): Promise<ToolDescriptor[]>;
  execute(command: ExecuteToolCommand): Promise<ToolExecutionResult>;
}
