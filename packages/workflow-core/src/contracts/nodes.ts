import type {
  CredentialRef,
  NodePorts,
  ValueOrVariable,
  VariableRef,
  WorkflowInputDefinition,
  WorkflowPosition,
} from "./primitives.js";

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
  | "knowledge";

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
  | UnknownWorkflowNode;
