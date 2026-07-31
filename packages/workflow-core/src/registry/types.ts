import type { BuiltinNodeConfigMap, BuiltinNodeType } from "../contracts/nodes.js";
import type { NodePorts } from "../contracts/primitives.js";
import type { WorkflowDiagnostic } from "../contracts/diagnostics.js";
import type { WorkflowJsonSchema } from "../contracts/json-schema.js";

export type { WorkflowJsonSchema } from "../contracts/json-schema.js";

/** Agent 运行时执行器的稳定身份。 */
export type ExecutorIdentity = { id: string; version: number };

/** 节点注册定义，统一默认配置、端口、校验和执行器 identity。 */
export type NodeDefinition<T extends BuiltinNodeType = BuiltinNodeType> = {
  type: T;
  version: number;
  category: "input-output" | "ai" | "integration" | "logic" | "transform" | "knowledge" | "control" | "container" | "human";
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
