import type { BuiltinNodeConfigMap, BuiltinNodeType } from "../contracts/nodes.js";
import type { NodePorts } from "../contracts/primitives.js";
import type { WorkflowDiagnostic } from "../contracts/diagnostics.js";

/** workflow-core 使用的最小 JSON Schema 契约。 */
export type WorkflowJsonSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, WorkflowJsonSchema>;
  required?: string[];
  items?: WorkflowJsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  additionalProperties?: boolean | WorkflowJsonSchema;
};

/** Agent 运行时执行器的稳定身份。 */
export type ExecutorIdentity = { id: string; version: number };

/** 节点注册定义，统一默认配置、端口、校验和执行器 identity。 */
export type NodeDefinition<T extends BuiltinNodeType = BuiltinNodeType> = {
  type: T;
  version: number;
  category: "input-output" | "ai" | "integration" | "logic" | "transform" | "knowledge";
  label: string;
  description: string;
  icon: string;
  color: string;
  inspectorId: string;
  executor: ExecutorIdentity;
  configSchema: WorkflowJsonSchema;
  createDefaultConfig: () => BuiltinNodeConfigMap[T];
  createPorts: (config: BuiltinNodeConfigMap[T]) => NodePorts;
  validate: (config: BuiltinNodeConfigMap[T], nodeId: string) => WorkflowDiagnostic[];
};

/** 任意一个内置节点定义的联合类型。 */
export type AnyNodeDefinition = {
  [T in BuiltinNodeType]: NodeDefinition<T>;
}[BuiltinNodeType];

/** 只读节点注册表接口。 */
export type NodeDefinitionRegistry = {
  get<T extends BuiltinNodeType>(type: T): NodeDefinition<T> | undefined;
  has(type: string): type is BuiltinNodeType;
  list(): AnyNodeDefinition[];
};
