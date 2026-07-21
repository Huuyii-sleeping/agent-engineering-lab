import type { BuiltinNodeConfigMap, BuiltinNodeType, WorkflowNodeExecutionPolicy } from "../contracts/nodes.js";
import type { NodePorts } from "../contracts/primitives.js";
import type { WorkflowDiagnostic } from "../contracts/diagnostics.js";
import type { ExecutorIdentity } from "../registry/types.js";

/** 当前 Workflow IR 契约版本。 */
export const WORKFLOW_IR_VERSION = 1 as const;

/** 编译和运行阶段使用的硬资源限制。 */
export type WorkflowExecutionLimits = {
  maxNodes: number;
  maxEdges: number;
  maxEstimatedSteps: number;
  maxParallelism: number;
  maxRuntimeMs: number;
  maxOutputBytes: number;
};

/** Runtime MVP 的默认资源限制。 */
export const DEFAULT_WORKFLOW_EXECUTION_LIMITS: WorkflowExecutionLimits = {
  maxNodes: 200,
  maxEdges: 400,
  maxEstimatedSteps: 1_000,
  maxParallelism: 10,
  maxRuntimeMs: 86_400_000,
  maxOutputBytes: 1_048_576,
};

/** 编译器根据静态图估算的资源规模。 */
export type WorkflowResourceEstimate = {
  nodeCount: number;
  edgeCount: number;
  estimatedSteps: number;
  maxParallelism: number;
};

/** IR 携带的资源预算，运行时不得突破该限制。 */
export type WorkflowResourceBudget = {
  limits: WorkflowExecutionLimits;
  estimate: WorkflowResourceEstimate;
};

/** IR 的来源，区分可变草稿和不可变发布版本。 */
export type WorkflowIRSource =
  | { kind: "draft"; workflowId: string; revision: number; migrated: boolean }
  | { kind: "version"; workflowId: string; versionId: string; version: number; contentHash: string };

/** 编译后节点；只保留 runtime 所需字段和稳定 executor identity。 */
export type WorkflowIRNode = {
  id: string;
  type: BuiltinNodeType;
  nodeVersion: number;
  label: string;
  disabled: boolean;
  config: BuiltinNodeConfigMap[BuiltinNodeType];
  ports: NodePorts;
  executor: ExecutorIdentity;
  execution: Required<Pick<WorkflowNodeExecutionPolicy, "timeoutMs" | "maxAttempts" | "retryBackoffMs" | "idempotent" | "onError">> & Pick<WorkflowNodeExecutionPolicy, "defaultOutput" | "errorPortId">;
};

/** 编译后连边。 */
export type WorkflowIREdge = {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  label?: string;
};

/** 确定性调度拓扑。 */
export type WorkflowExecutionTopology = {
  orderedNodeIds: string[];
  entryNodeIds: string[];
  terminalNodeIds: string[];
  dependencies: Record<string, string[]>;
  dependents: Record<string, string[]>;
};

/** 发布或草稿试运行所消费的不可变中间表示。 */
export type WorkflowIR = {
  irVersion: typeof WORKFLOW_IR_VERSION;
  schemaVersion: 2;
  source: WorkflowIRSource;
  nodes: WorkflowIRNode[];
  edges: WorkflowIREdge[];
  topology: WorkflowExecutionTopology;
  resourceBudget: WorkflowResourceBudget;
  dependencies: Array<{ nodeType: BuiltinNodeType; nodeVersion: number; executor: ExecutorIdentity }>;
};

/** 编译器选项；executor 列表为空时使用内置注册表全集。 */
export type CompileWorkflowOptions = {
  limits?: Partial<WorkflowExecutionLimits>;
  executors?: ExecutorIdentity[];
};

/** 编译结果；存在 error 诊断时不返回半成品 IR。 */
export type WorkflowCompileResult =
  | { ok: true; ir: WorkflowIR; diagnostics: WorkflowDiagnostic[] }
  | { ok: false; diagnostics: WorkflowDiagnostic[] };
