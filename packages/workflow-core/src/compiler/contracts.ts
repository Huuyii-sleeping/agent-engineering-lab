import type { BuiltinNodeConfigMap, BuiltinNodeType, WorkflowNodeExecutionPolicy } from "../contracts/nodes.js";
import type { WorkflowReferenceResolvers } from "../contracts/references.js";
import type { NodePorts } from "../contracts/primitives.js";
import type { WorkflowDiagnostic } from "../contracts/diagnostics.js";
import type { ExecutorIdentity } from "../registry/types.js";

/** 当前 Workflow IR 契约版本。 */
export const WORKFLOW_IR_VERSION = 2 as const;

/** 编译和运行阶段使用的硬资源限制。 */
export type WorkflowExecutionLimits = {
  maxNodes: number;
  maxEdges: number;
  maxEstimatedSteps: number;
  maxParallelism: number;
  maxRuntimeMs: number;
  maxOutputBytes: number;
  maxIterationItems: number;
  maxLoopIterations: number;
  maxNestedDepth: number;
  maxWaitingMs: number;
};

/** Runtime MVP 的默认资源限制。 */
export const DEFAULT_WORKFLOW_EXECUTION_LIMITS: WorkflowExecutionLimits = {
  maxNodes: 200,
  maxEdges: 400,
  maxEstimatedSteps: 1_000,
  maxParallelism: 10,
  maxRuntimeMs: 86_400_000,
  maxOutputBytes: 1_048_576,
  maxIterationItems: 1_000,
  maxLoopIterations: 1_000,
  maxNestedDepth: 5,
  maxWaitingMs: 30 * 24 * 60 * 60 * 1_000,
};

/** 编译器根据静态图估算的资源规模。 */
export type WorkflowResourceEstimate = {
  nodeCount: number;
  edgeCount: number;
  estimatedSteps: number;
  maxParallelism: number;
  maxNestedDepth: number;
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

/** IR 节点共用字段；只保留 runtime 所需配置和稳定 executor identity。 */
export type WorkflowIRNodeBase<T extends BuiltinNodeType> = {
  id: string;
  type: T;
  nodeVersion: number;
  label: string;
  disabled: boolean;
  config: BuiltinNodeConfigMap[T];
  ports: NodePorts;
  executor: ExecutorIdentity;
  execution: Required<Pick<WorkflowNodeExecutionPolicy, "timeoutMs" | "maxAttempts" | "retryBackoffMs" | "idempotent" | "onError">> & Pick<WorkflowNodeExecutionPolicy, "defaultOutput" | "errorPortId">;
};

/** P0 可执行节点类型。 */
export type WorkflowIRExecutableNodeType = Exclude<
  BuiltinNodeType,
  "parallel" | "merge" | "iteration" | "loop" | "subworkflow" | "agent" | "human-approval"
>;

/** P0 可执行节点。 */
export type WorkflowIRExecutableNode = {
  [T in WorkflowIRExecutableNodeType]: WorkflowIRNodeBase<T> & { kind: "executable" };
}[WorkflowIRExecutableNodeType];

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

/** 可递归嵌套的确定性 IR 图。 */
export type WorkflowIRGraph = {
  nodes: WorkflowIRNode[];
  edges: WorkflowIREdge[];
  topology: WorkflowExecutionTopology;
};

/** Parallel 的有序静态分支 IR。 */
export type WorkflowIRParallelBranch = {
  id: string;
  label: string;
  order: number;
  entryNodeId: string;
  graph: WorkflowIRGraph;
};

/** Parallel 控制节点及对应 Merge 契约。 */
export type WorkflowIRParallelNode = WorkflowIRNodeBase<"parallel"> & {
  kind: "parallel";
  branches: WorkflowIRParallelBranch[];
  merge: {
    nodeId: string;
    strategy: BuiltinNodeConfigMap["merge"]["strategy"];
    allowMissing: boolean;
  };
};

/** 顶层 Merge identity；实际分支聚合契约同时固化在 Parallel IR。 */
export type WorkflowIRMergeNode = WorkflowIRNodeBase<"merge"> & {
  kind: "merge";
  parallelNodeId: string;
};

/** Iteration 容器节点。 */
export type WorkflowIRIterationNode = WorkflowIRNodeBase<"iteration"> & {
  kind: "iteration";
  body: WorkflowIRGraph;
};

/** Loop 容器节点。 */
export type WorkflowIRLoopNode = WorkflowIRNodeBase<"loop"> & {
  kind: "loop";
  body: WorkflowIRGraph;
};

/** Subworkflow 固定版本依赖 identity。 */
export type WorkflowIRWorkflowDependency = {
  workflowId: string;
  versionId: string;
  version: number;
  contentHash: string;
};

/** 固定版本 Subworkflow 节点。 */
export type WorkflowIRSubworkflowNode = WorkflowIRNodeBase<"subworkflow"> & {
  kind: "subworkflow";
  dependency: WorkflowIRWorkflowDependency;
  workflow: WorkflowIRGraph;
};

/** 通过 AgentRuntimePort 创建逻辑 child run 的节点。 */
export type WorkflowIRAgentNode = WorkflowIRNodeBase<"agent"> & {
  kind: "agent";
  childRun: {
    agentProfileId: string;
    agentVersionId: string;
    contentHash: string;
    memoryIsolation: "node-run";
  };
};

/** 通过 Mastra suspend/resume 等待当前 run 人工决定的节点。 */
export type WorkflowIRHumanApprovalNode = WorkflowIRNodeBase<"human-approval"> & {
  kind: "human-approval";
  suspend: {
    policyId: string;
    displayFields: BuiltinNodeConfigMap["human-approval"]["displayFields"];
    decisionSchema: Record<string, unknown>;
    deadlineMs: number;
    timeoutPolicy: BuiltinNodeConfigMap["human-approval"]["timeoutPolicy"];
  };
};

/** Workflow IR v2 节点判别联合。 */
export type WorkflowIRNode =
  | WorkflowIRExecutableNode
  | WorkflowIRParallelNode
  | WorkflowIRMergeNode
  | WorkflowIRIterationNode
  | WorkflowIRLoopNode
  | WorkflowIRSubworkflowNode
  | WorkflowIRAgentNode
  | WorkflowIRHumanApprovalNode;

/** Workflow IR 外部依赖联合。 */
export type WorkflowIRDependency =
  | { kind: "executor"; nodeType: BuiltinNodeType; nodeVersion: number; executor: ExecutorIdentity }
  | ({ kind: "workflow-version" } & WorkflowIRWorkflowDependency)
  | { kind: "agent-version"; agentProfileId: string; agentVersionId: string; contentHash: string }
  | { kind: "approval-policy"; policyId: string };

/** 发布或草稿试运行所消费的不可变中间表示。 */
export type WorkflowIR = {
  irVersion: typeof WORKFLOW_IR_VERSION;
  schemaVersion: 2;
  source: WorkflowIRSource;
  nodes: WorkflowIRNode[];
  edges: WorkflowIREdge[];
  topology: WorkflowExecutionTopology;
  resourceBudget: WorkflowResourceBudget;
  dependencies: WorkflowIRDependency[];
};

/** 编译器选项；executor 列表为空时使用内置注册表全集。 */
export type CompileWorkflowOptions = WorkflowReferenceResolvers & {
  limits?: Partial<WorkflowExecutionLimits>;
  executors?: ExecutorIdentity[];
};

/** 编译结果；存在 error 诊断时不返回半成品 IR。 */
export type WorkflowCompileResult =
  | { ok: true; ir: WorkflowIR; diagnostics: WorkflowDiagnostic[] }
  | { ok: false; diagnostics: WorkflowDiagnostic[] };
