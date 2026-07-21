import type { WorkflowNode, WorkflowNodeExecutionPolicy } from "../contracts/nodes.js";
import type { WorkflowDiagnostic } from "../contracts/diagnostics.js";
import { WORKFLOW_SCHEMA_VERSION } from "../contracts/primitives.js";
import { isWorkflowDraft, isWorkflowVersion, type WorkflowDraft, type WorkflowVersion } from "../contracts/workflow.js";
import { topologicalSort } from "../graph/graph.js";
import { migrateSopDraftV1 } from "../migration/v1.js";
import { builtinNodeRegistry } from "../registry/builtins.js";
import type { ExecutorIdentity } from "../registry/types.js";
import { normalizeWorkflowDraft } from "../serialization/stable.js";
import { validateWorkflowDraft } from "../validation/publish.js";
import {
  DEFAULT_WORKFLOW_EXECUTION_LIMITS,
  WORKFLOW_IR_VERSION,
  type CompileWorkflowOptions,
  type WorkflowCompileResult,
  type WorkflowExecutionLimits,
  type WorkflowExecutionTopology,
  type WorkflowIR,
  type WorkflowIRSource,
  type WorkflowResourceEstimate,
} from "./contracts.js";
import { validateWorkflowJsonSchema } from "./schema.js";

function diagnostic(code: string, message: string, location: WorkflowDiagnostic["location"]): WorkflowDiagnostic {
  return { code, severity: "error", message, location };
}

function versionAsDraft(version: WorkflowVersion): WorkflowDraft {
  const metadata = version.metadata ?? {};
  return normalizeWorkflowDraft({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: version.workflowId,
    name: typeof metadata.name === "string" ? metadata.name : `工作流 v${version.version}`,
    summary: typeof metadata.summary === "string" ? metadata.summary : "",
    revision: typeof metadata.sourceRevision === "number" ? metadata.sourceRevision : 0,
    createdAt: version.createdAt,
    updatedAt: version.createdAt,
    nodes: version.nodes,
    edges: version.edges,
    metadata: version.metadata,
  });
}

function normalizeSource(value: unknown): { draft: WorkflowDraft; source: WorkflowIRSource } {
  if (isWorkflowVersion(value)) return {
    draft: versionAsDraft(value),
    source: { kind: "version", workflowId: value.workflowId, versionId: value.id, version: value.version, contentHash: value.contentHash },
  };
  if (isWorkflowDraft(value)) {
    const draft = normalizeWorkflowDraft(value);
    return { draft, source: { kind: "draft", workflowId: draft.id, revision: draft.revision, migrated: false } };
  }
  const draft = migrateSopDraftV1(value);
  return { draft, source: { kind: "draft", workflowId: draft.id, revision: draft.revision, migrated: true } };
}

function executionLimits(value: CompileWorkflowOptions["limits"]): WorkflowExecutionLimits {
  return { ...DEFAULT_WORKFLOW_EXECUTION_LIMITS, ...value };
}

function topology(draft: WorkflowDraft, orderedNodeIds: string[]): WorkflowExecutionTopology {
  const dependencies: Record<string, string[]> = {};
  const dependents: Record<string, string[]> = {};
  for (const nodeId of orderedNodeIds) {
    dependencies[nodeId] = [];
    dependents[nodeId] = [];
  }
  for (const edge of draft.edges) {
    dependencies[edge.target.nodeId]?.push(edge.source.nodeId);
    dependents[edge.source.nodeId]?.push(edge.target.nodeId);
  }
  for (const nodeId of orderedNodeIds) {
    dependencies[nodeId] = [...new Set(dependencies[nodeId])].sort();
    dependents[nodeId] = [...new Set(dependents[nodeId])].sort();
  }
  return {
    orderedNodeIds,
    entryNodeIds: orderedNodeIds.filter((nodeId) => dependencies[nodeId].length === 0),
    terminalNodeIds: orderedNodeIds.filter((nodeId) => dependents[nodeId].length === 0),
    dependencies,
    dependents,
  };
}

function estimateResources(graph: WorkflowExecutionTopology, edgeCount: number): WorkflowResourceEstimate {
  const depth = new Map<string, number>();
  for (const nodeId of graph.orderedNodeIds) {
    const dependencyDepths = graph.dependencies[nodeId].map((dependencyId) => depth.get(dependencyId) ?? 0);
    depth.set(nodeId, dependencyDepths.length === 0 ? 0 : Math.max(...dependencyDepths) + 1);
  }
  const widthByDepth = new Map<number, number>();
  for (const value of depth.values()) widthByDepth.set(value, (widthByDepth.get(value) ?? 0) + 1);
  return {
    nodeCount: graph.orderedNodeIds.length,
    edgeCount,
    estimatedSteps: graph.orderedNodeIds.length,
    maxParallelism: Math.max(0, ...widthByDepth.values()),
  };
}

function executorKey(identity: ExecutorIdentity): string {
  return `${identity.id}@${identity.version}`;
}

function builtInExecutors(): ExecutorIdentity[] {
  return builtinNodeRegistry.list().map((definition) => definition.executor);
}

type KnownWorkflowNode = Exclude<WorkflowNode, { kind: "unknown" }>;

function compileNode(node: WorkflowNode): KnownWorkflowNode | null {
  return node.kind === "builtin" ? node : null;
}

function defaultExecutionPolicy(node: KnownWorkflowNode): WorkflowIR["nodes"][number]["execution"] {
  const mutatingHttp = node.type === "http" && node.config.method !== "GET";
  const idempotentByDefault = !["llm", "tool"].includes(node.type) && !mutatingHttp;
  const policy: WorkflowNodeExecutionPolicy = node.execution ?? {};
  const idempotent = policy.idempotent ?? idempotentByDefault;
  return {
    timeoutMs: Math.max(100, Math.trunc(policy.timeoutMs ?? (node.type === "http" ? node.config.timeoutMs : 30_000))),
    maxAttempts: Math.max(1, Math.trunc(policy.maxAttempts ?? (idempotent ? 2 : 1))),
    retryBackoffMs: Math.max(0, Math.trunc(policy.retryBackoffMs ?? 250)),
    idempotent,
    onError: policy.onError ?? "fail",
    defaultOutput: policy.defaultOutput,
    errorPortId: policy.errorPortId,
  };
}

/** 将 v1/v2 草稿或不可变发布版本编译为确定性 Workflow IR。 */
export function compileWorkflow(value: unknown, options: CompileWorkflowOptions = {}): WorkflowCompileResult {
  let normalized: ReturnType<typeof normalizeSource>;
  try {
    normalized = normalizeSource(value);
  } catch (error) {
    return { ok: false, diagnostics: [diagnostic("compile.input", error instanceof Error ? error.message : "工作流输入无效。", { kind: "workflow" })] };
  }

  const { draft, source } = normalized;
  const limits = executionLimits(options.limits);
  const diagnostics = [...validateWorkflowDraft(draft).diagnostics];
  if (draft.nodes.length > limits.maxNodes) diagnostics.push(diagnostic("compile.node-limit", `节点数 ${draft.nodes.length} 超过编译上限 ${limits.maxNodes}。`, { kind: "workflow" }));
  if (draft.edges.length > limits.maxEdges) diagnostics.push(diagnostic("compile.edge-limit", `连边数 ${draft.edges.length} 超过编译上限 ${limits.maxEdges}。`, { kind: "workflow" }));

  const availableExecutors = new Set((options.executors ?? builtInExecutors()).map(executorKey));
  for (const node of draft.nodes) {
    if (node.kind === "unknown") continue;
    const definition = builtinNodeRegistry.get(node.type);
    if (!definition) continue;
    diagnostics.push(...validateWorkflowJsonSchema(node.config, definition.configSchema, node.id));
    if (node.version !== definition.version) diagnostics.push(diagnostic("compile.node-version", `节点「${node.label}」版本 ${node.version} 与当前支持版本 ${definition.version} 不一致。`, { kind: "node", nodeId: node.id }));
    if (!availableExecutors.has(executorKey(definition.executor))) diagnostics.push(diagnostic("compile.executor-missing", `节点「${node.label}」缺少执行器 ${executorKey(definition.executor)}。`, { kind: "node", nodeId: node.id }));
  }

  if (diagnostics.some((item) => item.severity === "error")) return { ok: false, diagnostics };

  const orderedNodeIds = topologicalSort(draft.nodes, draft.edges);
  const graph = topology(draft, orderedNodeIds);
  const estimate = estimateResources(graph, draft.edges.length);
  if (estimate.estimatedSteps > limits.maxEstimatedSteps) diagnostics.push(diagnostic("compile.step-limit", `预计执行步数 ${estimate.estimatedSteps} 超过上限 ${limits.maxEstimatedSteps}。`, { kind: "workflow" }));
  if (estimate.maxParallelism > limits.maxParallelism) diagnostics.push(diagnostic("compile.parallelism-limit", `预计并行度 ${estimate.maxParallelism} 超过上限 ${limits.maxParallelism}。`, { kind: "workflow" }));
  if (diagnostics.some((item) => item.severity === "error")) return { ok: false, diagnostics };

  const nodeById = new Map(draft.nodes.map((node) => [node.id, node]));
  const compiledNodes = orderedNodeIds.map((nodeId) => compileNode(nodeById.get(nodeId)!)).filter((node): node is KnownWorkflowNode => Boolean(node)).map((node) => ({
    id: node.id,
    type: node.type,
    nodeVersion: node.version,
    label: node.label,
    disabled: node.disabled === true,
    config: node.config,
    ports: node.ports,
    executor: builtinNodeRegistry.get(node.type)!.executor,
    execution: defaultExecutionPolicy(node),
  }));
  const ir: WorkflowIR = {
    irVersion: WORKFLOW_IR_VERSION,
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    source,
    nodes: compiledNodes,
    edges: [...draft.edges].sort((left, right) => left.id.localeCompare(right.id)).map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.source.nodeId,
      sourcePortId: edge.source.portId,
      targetNodeId: edge.target.nodeId,
      targetPortId: edge.target.portId,
      label: edge.label,
    })),
    topology: graph,
    resourceBudget: { limits, estimate },
    dependencies: compiledNodes.map((node) => ({ nodeType: node.type, nodeVersion: node.nodeVersion, executor: node.executor })),
  };
  return { ok: true, ir, diagnostics };
}
