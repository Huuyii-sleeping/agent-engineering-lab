/** 当前工作流定义的 schema 版本。 */
export const WORKFLOW_SCHEMA_VERSION = 2 as const;

/** 工作流端口和变量支持的数据类型。 */
export type WorkflowDataType =
  | "any"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "binary"
  | "null";

/** 画布中的二维位置。 */
export type WorkflowPosition = { x: number; y: number };

/** 节点输入或输出端口。 */
export type NodePort = {
  id: string;
  name: string;
  direction: "input" | "output";
  dataType: WorkflowDataType;
  required?: boolean;
  multiple?: boolean;
  description?: string;
};

/** 节点当前生效的输入输出端口集合。 */
export type NodePorts = {
  inputs: NodePort[];
  outputs: NodePort[];
};

/** 工作流输入变量引用。 */
export type WorkflowInputRef = {
  scope: "workflow-input";
  inputId: string;
  path?: string[];
};

/** 上游节点输出变量引用。 */
export type NodeOutputRef = {
  scope: "node-output";
  nodeId: string;
  portId: string;
  path?: string[];
};

/** 系统运行上下文变量引用。 */
export type SystemVariableRef = {
  scope: "system";
  key: string;
  path?: string[];
};

/** 环境变量引用。 */
export type EnvironmentVariableRef = {
  scope: "environment";
  key: string;
};

/** Secret 变量引用；定义中永远不保存 secret value。 */
export type SecretVariableRef = {
  scope: "secret";
  credentialId: string;
  key?: string;
};

/** 容器显式输入引用，只能在所属子图内部使用。 */
export type ContainerInputRef = {
  scope: "container-input";
  containerNodeId: string;
  inputId: string;
  path?: string[];
};

/** Iteration/Loop 容器运行上下文变量引用。 */
export type LoopVariableRef = {
  scope: "loop";
  containerNodeId: string;
  key: "item" | "index" | "iteration" | "variable" | "previous-output";
  variableId?: string;
  outputId?: string;
  path?: string[];
};

/** 工作流可持久化的显式变量引用。 */
export type VariableRef =
  | WorkflowInputRef
  | NodeOutputRef
  | SystemVariableRef
  | EnvironmentVariableRef
  | SecretVariableRef
  | ContainerInputRef
  | LoopVariableRef;

/** 凭据引用及节点需要的 capability；不包含凭据明文。 */
export type CredentialRef = {
  credentialId: string;
  capability: string;
  key?: string;
};

/** 工作流可声明的输入字段。 */
export type WorkflowInputDefinition = {
  id: string;
  name: string;
  dataType: WorkflowDataType;
  required?: boolean;
  description?: string;
  defaultValue?: unknown;
};

/** 配置字段可以是字面量，也可以显式引用变量。 */
export type ValueOrVariable<T = unknown> =
  | { kind: "literal"; value: T }
  | { kind: "variable"; ref: VariableRef };
