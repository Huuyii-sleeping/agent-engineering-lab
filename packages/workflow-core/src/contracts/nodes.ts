import type {
  CredentialRef,
  NodePorts,
  ValueOrVariable,
  VariableRef,
  WorkflowDataType,
  WorkflowInputDefinition,
  WorkflowPosition,
} from "./primitives.js";
import type { WorkflowEdge } from "./workflow.js";
import type { WorkflowJsonSchema } from "./json-schema.js";

/** 第一批内置节点类型。 */
export type BuiltinNodeType =
  | "start"
  | "end"
  | "llm"
  | "tool"
  | "http"
  | "code"
  | "condition"
  | "template"
  | "variable"
  | "knowledge"
  | "parallel"
  | "merge"
  | "iteration"
  | "loop"
  | "subworkflow"
  | "agent"
  | "human-approval";

/** Start/Input 节点配置。 */
export type StartNodeConfig = { inputs: WorkflowInputDefinition[] };

/** End/Output 节点配置。 */
export type EndNodeConfig = {
  outputs: Array<{ id: string; name: string; value?: VariableRef }>;
};

/** LLM 节点配置。 */
export type LlmNodeConfig = {
  model: string;
  systemPrompt?: string;
  prompt: ValueOrVariable<string>;
  temperature?: number;
};

/** Tool 节点配置。 */
export type ToolNodeConfig = {
  toolId: string;
  arguments: Record<string, ValueOrVariable>;
  credential?: CredentialRef;
};

/** HTTP 节点配置。 */
export type HttpNodeConfig = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: ValueOrVariable<string>;
  headers: Record<string, ValueOrVariable<string>>;
  body?: ValueOrVariable;
  credential?: CredentialRef;
  timeoutMs: number;
};

/** Code 节点配置。 */
export type CodeNodeConfig = {
  language: "javascript" | "python";
  source: string;
  inputs: Record<string, ValueOrVariable>;
};

/** Condition/Switch 节点配置。 */
export type ConditionNodeConfig = {
  expression: string;
  cases: Array<{ id: string; label: string; expression: string }>;
};

/** Template 节点配置。 */
export type TemplateNodeConfig = {
  template: string;
  variables: Record<string, ValueOrVariable>;
};

/** Variable Assign/Aggregate 节点配置。 */
export type VariableNodeConfig = {
  assignments: Array<{ key: string; value: ValueOrVariable }>;
};

/** Knowledge Retrieval 节点配置。 */
export type KnowledgeNodeConfig = {
  knowledgeBaseId: string;
  query: ValueOrVariable<string>;
  topK: number;
};

/** 容器子图对外声明的输入；id 在所属子图内必须稳定且唯一。 */
export type WorkflowSubgraphInput = {
  id: string;
  name: string;
  dataType: WorkflowDataType;
  required?: boolean;
  description?: string;
};

/** 容器子图对外声明的输出，只允许引用子图内部可达节点。 */
export type WorkflowSubgraphOutput = {
  id: string;
  name: string;
  dataType: WorkflowDataType;
  value: VariableRef;
};

/** 容器输入与外部值或变量之间的显式绑定。 */
export type WorkflowSubgraphInputBinding = {
  inputId: string;
  value: ValueOrVariable;
};

/** Iteration 与 Loop 共用的框架无关、可递归持久化子图。 */
export type WorkflowSubgraph = {
  id: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  inputs: WorkflowSubgraphInput[];
  outputs: WorkflowSubgraphOutput[];
};

/** Parallel 静态分支声明；id 同时作为稳定输出端口 id。 */
export type ParallelBranch = { id: string; label: string };

/** Parallel 节点配置。运行时并发还会受 IR 与平台上限约束。 */
export type ParallelNodeConfig = {
  branches: ParallelBranch[];
  maxConcurrency: number;
  failurePolicy: "fail-fast" | "collect";
};

/** Merge 节点配置，显式关联唯一的上游 Parallel。 */
export type MergeNodeConfig = {
  parallelNodeId: string;
  strategy: "ordered" | "by-branch";
  allowMissing: boolean;
};

/** Iteration 对数组逐项执行统一子图的受限配置。 */
export type IterationNodeConfig = {
  items: ValueOrVariable<unknown[]>;
  maxItems: number;
  maxConcurrency: number;
  itemTimeoutMs: number;
  timeoutMs: number;
  failurePolicy: "fail-fast" | "continue" | "collect-errors";
  aggregation: "ordered" | "by-index";
  inputBindings: WorkflowSubgraphInputBinding[];
  body: WorkflowSubgraph;
};

/** Loop 显式初始变量；变量名在所属 Loop 内必须稳定且唯一。 */
export type LoopInitialVariable = {
  id: string;
  name: string;
  dataType: WorkflowDataType;
  value: ValueOrVariable;
};

/** Loop 使用 Mastra 原生 while/until 控制流的受限配置。 */
export type LoopNodeConfig = {
  mode: "while" | "until";
  condition: string;
  initialVariables: LoopInitialVariable[];
  maxIterations: number;
  timeoutMs: number;
  inputBindings: WorkflowSubgraphInputBinding[];
  body: WorkflowSubgraph;
};

/** 固定版本子流程的输入绑定。 */
export type SubworkflowInputBinding = {
  inputId: string;
  value: ValueOrVariable;
};

/** 固定版本子流程的输出声明。 */
export type SubworkflowOutputBinding = {
  outputId: string;
  name: string;
  dataType: WorkflowDataType;
};

/** Subworkflow 只保存不可变产品版本引用，不保存 Runtime Workflow 对象。 */
export type SubworkflowNodeConfig = {
  workflowId: string;
  versionId: string;
  contentHash: string;
  inputBindings: SubworkflowInputBinding[];
  outputBindings: SubworkflowOutputBinding[];
};

/** Agent 节点输出 schema 使用的可持久化 JSON Schema 子集。 */
export type AgentOutputSchema = WorkflowJsonSchema;

/** Agent 节点的隔离 Memory 约束；阶段 E 不允许共享会话线程。 */
export type AgentMemoryConfig = {
  isolation: "node-run";
  shareThread: false;
};

/** Agent 节点只保存发布 profile/version 引用，不接受客户端 Tool 白名单。 */
export type AgentNodeConfig = {
  agentProfileId: string;
  agentVersionId: string;
  inputBindings: Record<string, ValueOrVariable>;
  outputSchema: AgentOutputSchema;
  memory: AgentMemoryConfig;
};

/** Human Approval 展示字段；value 在运行前解析并按控制面策略脱敏。 */
export type HumanApprovalDisplayField = {
  id: string;
  label: string;
  value: ValueOrVariable;
};

/** Human Approval 只保存策略和 schema，不保存 token、凭据或历史决定。 */
export type HumanApprovalNodeConfig = {
  policyId: string;
  displayFields: HumanApprovalDisplayField[];
  decisionSchema: Record<string, unknown>;
  deadlineMs: number;
  timeoutPolicy: "reject" | "fail" | "error-route";
};

/** 内置节点配置的类型映射。 */
export type BuiltinNodeConfigMap = {
  start: StartNodeConfig;
  end: EndNodeConfig;
  llm: LlmNodeConfig;
  tool: ToolNodeConfig;
  http: HttpNodeConfig;
  code: CodeNodeConfig;
  condition: ConditionNodeConfig;
  template: TemplateNodeConfig;
  variable: VariableNodeConfig;
  knowledge: KnowledgeNodeConfig;
  parallel: ParallelNodeConfig;
  merge: MergeNodeConfig;
  iteration: IterationNodeConfig;
  loop: LoopNodeConfig;
  subworkflow: SubworkflowNodeConfig;
  agent: AgentNodeConfig;
  "human-approval": HumanApprovalNodeConfig;
};

/** 节点运行失败后的处理策略。 */
export type WorkflowNodeErrorStrategy = "fail" | "default" | "route";

/** 节点级超时、重试、幂等和失败路由策略。 */
export type WorkflowNodeExecutionPolicy = {
  timeoutMs?: number;
  maxAttempts?: number;
  retryBackoffMs?: number;
  idempotent?: boolean;
  onError?: WorkflowNodeErrorStrategy;
  defaultOutput?: Record<string, unknown>;
  errorPortId?: string;
};

/** 所有节点共享的持久化字段。 */
export type WorkflowNodeBase = {
  id: string;
  version: number;
  label: string;
  position: WorkflowPosition;
  ports: NodePorts;
  description?: string;
  disabled?: boolean;
  execution?: WorkflowNodeExecutionPolicy;
};

/** 指定类型的内置工作流节点。 */
export type BuiltinWorkflowNode<T extends BuiltinNodeType = BuiltinNodeType> = WorkflowNodeBase & {
  kind: "builtin";
  type: T;
  config: BuiltinNodeConfigMap[T];
};

/** 未安装节点的无损保留模型。 */
export type UnknownWorkflowNode = WorkflowNodeBase & {
  kind: "unknown";
  type: string;
  original: Record<string, unknown>;
};

/** 可持久化的判别联合节点。 */
export type WorkflowNode =
  | BuiltinWorkflowNode<"start">
  | BuiltinWorkflowNode<"end">
  | BuiltinWorkflowNode<"llm">
  | BuiltinWorkflowNode<"tool">
  | BuiltinWorkflowNode<"http">
  | BuiltinWorkflowNode<"code">
  | BuiltinWorkflowNode<"condition">
  | BuiltinWorkflowNode<"template">
  | BuiltinWorkflowNode<"variable">
  | BuiltinWorkflowNode<"knowledge">
  | BuiltinWorkflowNode<"parallel">
  | BuiltinWorkflowNode<"merge">
  | BuiltinWorkflowNode<"iteration">
  | BuiltinWorkflowNode<"loop">
  | BuiltinWorkflowNode<"subworkflow">
  | BuiltinWorkflowNode<"agent">
  | BuiltinWorkflowNode<"human-approval">
  | UnknownWorkflowNode;
