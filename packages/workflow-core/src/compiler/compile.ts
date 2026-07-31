import type { BuiltinNodeType, BuiltinWorkflowNode, WorkflowNode, WorkflowNodeExecutionPolicy } from "../contracts/nodes.js";
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
  type WorkflowIRDependency,
  type WorkflowIREdge,
  type WorkflowIRGraph,
  type WorkflowIRNode,
  type WorkflowIRNodeBase,
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

function topology(draft: Pick<WorkflowDraft, "edges">, orderedNodeIds: string[]): WorkflowExecutionTopology {
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

function graphParallelism(graph: WorkflowExecutionTopology): number {
  const depth = new Map<string, number>();
  for (const nodeId of graph.orderedNodeIds) {
    const dependencyDepths = graph.dependencies[nodeId].map((dependencyId) => depth.get(dependencyId) ?? 0);
    depth.set(nodeId, dependencyDepths.length === 0 ? 0 : Math.max(...dependencyDepths) + 1);
  }
  const widthByDepth = new Map<number, number>();
  for (const value of depth.values()) widthByDepth.set(value, (widthByDepth.get(value) ?? 0) + 1);
  return Math.max(0, ...widthByDepth.values());
}

function mergeEstimate(left: WorkflowResourceEstimate, right: WorkflowResourceEstimate): WorkflowResourceEstimate {
  return {
    nodeCount: left.nodeCount + right.nodeCount,
    edgeCount: left.edgeCount + right.edgeCount,
    estimatedSteps: left.estimatedSteps + right.estimatedSteps,
    maxParallelism: Math.max(left.maxParallelism, right.maxParallelism),
    maxNestedDepth: Math.max(left.maxNestedDepth, right.maxNestedDepth),
  };
}

function multiplyDynamicSteps(estimate: WorkflowResourceEstimate, multiplier: number): WorkflowResourceEstimate {
  return { ...estimate, estimatedSteps: estimate.estimatedSteps * multiplier };
}

function estimateNodes(
  nodes: readonly WorkflowNode[],
  edges: WorkflowDraft["edges"],
  options: CompileWorkflowOptions,
  depth = 0,
): WorkflowResourceEstimate {
  const orderedNodeIds = topologicalSort(nodes, edges);
  const graph = topology({ edges }, orderedNodeIds);
  let estimate: WorkflowResourceEstimate = {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    estimatedSteps: nodes.length,
    maxParallelism: graphParallelism(graph),
    maxNestedDepth: depth,
  };
  for (const node of nodes) {
    if (node.kind !== "builtin") continue;
    if (node.type === "parallel") estimate.maxParallelism = Math.max(estimate.maxParallelism, node.config.maxConcurrency);
    if (node.type === "iteration") {
      const body = estimateNodes(node.config.body.nodes, node.config.body.edges, options, depth + 1);
      estimate = mergeEstimate(estimate, multiplyDynamicSteps(body, node.config.maxItems));
      estimate.maxParallelism = Math.max(estimate.maxParallelism, node.config.maxConcurrency);
    }
    if (node.type === "loop") {
      const body = estimateNodes(node.config.body.nodes, node.config.body.edges, options, depth + 1);
      estimate = mergeEstimate(estimate, multiplyDynamicSteps(body, node.config.maxIterations));
    }
    if (node.type === "subworkflow" && options.workflowVersions) {
      const version = options.workflowVersions.resolvePublishedVersion(node.config.workflowId, node.config.versionId);
      if (version) estimate = mergeEstimate(estimate, estimateNodes(version.nodes, version.edges, options, depth + 1));
    }
  }
  return estimate;
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

function defaultExecutionPolicy(node: BuiltinWorkflowNode): WorkflowIR["nodes"][number]["execution"] {
  const mutatingHttp = node.type === "http" && "method" in node.config && node.config.method !== "GET";
  const idempotentByDefault = !["llm", "tool"].includes(node.type) && !mutatingHttp;
  const policy: WorkflowNodeExecutionPolicy = node.execution ?? {};
  const idempotent = policy.idempotent ?? idempotentByDefault;
  return {
    timeoutMs: Math.max(100, Math.trunc(policy.timeoutMs ?? (node.type === "http" && "timeoutMs" in node.config ? node.config.timeoutMs : 30_000))),
    maxAttempts: Math.max(1, Math.trunc(policy.maxAttempts ?? (idempotent ? 2 : 1))),
    retryBackoffMs: Math.max(0, Math.trunc(policy.retryBackoffMs ?? 250)),
    idempotent,
    onError: policy.onError ?? "fail",
    defaultOutput: policy.defaultOutput,
    errorPortId: policy.errorPortId,
  };
}

function compileEdges(edges: WorkflowDraft["edges"]): WorkflowIREdge[] {
  return [...edges].sort((left, right) => left.id.localeCompare(right.id)).map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.source.nodeId,
    sourcePortId: edge.source.portId,
    targetNodeId: edge.target.nodeId,
    targetPortId: edge.target.portId,
    label: edge.label,
  }));
}

function nodeBase<T extends BuiltinNodeType>(node: BuiltinWorkflowNode<T>): WorkflowIRNodeBase<T> {
  return {
    id: node.id,
    type: node.type,
    nodeVersion: node.version,
    label: node.label,
    disabled: node.disabled === true,
    config: node.config,
    ports: node.ports,
    executor: builtinNodeRegistry.get(node.type)!.executor,
    execution: defaultExecutionPolicy(node),
  };
}

function branchSlice(
  nodes: readonly WorkflowNode[],
  edges: WorkflowDraft["edges"],
  entryNodeId: string,
  mergeNodeId: string,
): { nodes: WorkflowNode[]; edges: WorkflowDraft["edges"] } {
  const selected = new Set<string>();
  const queue = [entryNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === mergeNodeId || selected.has(current)) continue;
    selected.add(current);
    for (const edge of edges.filter((item) => item.source.nodeId === current)) queue.push(edge.target.nodeId);
  }
  return {
    nodes: nodes.filter((node) => selected.has(node.id)),
    edges: edges.filter((edge) => selected.has(edge.source.nodeId) && selected.has(edge.target.nodeId)),
  };
}

function compileGraph(
  nodes: readonly WorkflowNode[],
  edges: WorkflowDraft["edges"],
  options: CompileWorkflowOptions,
): WorkflowIRGraph {
  const orderedNodeIds = topologicalSort(nodes, edges);
  const graphTopology = topology({ edges }, orderedNodeIds);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const compiledNodes = orderedNodeIds
    .map((nodeId) => compileNode(nodeById.get(nodeId)!))
    .filter((node): node is KnownWorkflowNode => Boolean(node))
    .map((node) => compileIRNode(node, nodes, edges, options));
  return { nodes: compiledNodes, edges: compileEdges(edges), topology: graphTopology };
}

function compileIRNode(
  node: KnownWorkflowNode,
  nodes: readonly WorkflowNode[],
  edges: WorkflowDraft["edges"],
  options: CompileWorkflowOptions,
): WorkflowIRNode {
  switch (node.type) {
    case "parallel": {
      const merge = nodes.find((candidate): candidate is BuiltinWorkflowNode<"merge"> => (
        candidate.kind === "builtin" && candidate.type === "merge" && candidate.config.parallelNodeId === node.id
      ));
      if (!merge) throw new Error(`Parallel ${node.id} 缺少对应 Merge。`);
      const branches = node.config.branches.map((branch, order) => {
        const outgoing = edges.find((edge) => edge.source.nodeId === node.id && edge.source.portId === branch.id);
        if (!outgoing) throw new Error(`Parallel ${node.id} 分支 ${branch.id} 缺少入口。`);
        const slice = branchSlice(nodes, edges, outgoing.target.nodeId, merge.id);
        return {
          id: branch.id,
          label: branch.label,
          order,
          entryNodeId: outgoing.target.nodeId,
          graph: compileGraph(slice.nodes, slice.edges, options),
        };
      });
      return {
        ...nodeBase(node),
        kind: "parallel",
        branches,
        merge: { nodeId: merge.id, strategy: merge.config.strategy, allowMissing: merge.config.allowMissing },
      };
    }
    case "merge": return { ...nodeBase(node), kind: "merge", parallelNodeId: node.config.parallelNodeId };
    case "iteration": return { ...nodeBase(node), kind: "iteration", body: compileGraph(node.config.body.nodes, node.config.body.edges, options) };
    case "loop": return { ...nodeBase(node), kind: "loop", body: compileGraph(node.config.body.nodes, node.config.body.edges, options) };
    case "subworkflow": {
      const version = options.workflowVersions?.resolvePublishedVersion(node.config.workflowId, node.config.versionId);
      if (!version) throw new Error(`Subworkflow ${node.id} 的发布版本无法解析。`);
      return {
        ...nodeBase(node),
        kind: "subworkflow",
        dependency: {
          workflowId: version.workflowId,
          versionId: version.id,
          version: version.version,
          contentHash: version.contentHash,
        },
        workflow: compileGraph(version.nodes, version.edges, options),
      };
    }
    case "agent": {
      const version = options.agentVersions?.resolvePublishedVersion(node.config.agentProfileId, node.config.agentVersionId);
      if (!version) throw new Error(`Agent ${node.id} 的发布版本无法解析。`);
      return {
        ...nodeBase(node),
        kind: "agent",
        childRun: {
          agentProfileId: version.agentProfileId,
          agentVersionId: version.id,
          contentHash: version.contentHash,
          memoryIsolation: node.config.memory.isolation,
        },
      };
    }
    case "human-approval": return {
      ...nodeBase(node),
      kind: "human-approval",
      suspend: {
        policyId: node.config.policyId,
        displayFields: node.config.displayFields,
        decisionSchema: node.config.decisionSchema,
        deadlineMs: node.config.deadlineMs,
        timeoutPolicy: node.config.timeoutPolicy,
      },
    };
    default: return { ...nodeBase(node), kind: "executable" } as WorkflowIRNode;
  }
}

function collectDependencies(graph: WorkflowIRGraph): WorkflowIRDependency[] {
  const dependencies = new Map<string, WorkflowIRDependency>();
  const add = (dependency: WorkflowIRDependency): void => {
    const key = JSON.stringify(dependency);
    if (!dependencies.has(key)) dependencies.set(key, dependency);
  };
  const visit = (current: WorkflowIRGraph): void => {
    for (const node of current.nodes) {
      add({ kind: "executor", nodeType: node.type, nodeVersion: node.nodeVersion, executor: node.executor });
      if (node.kind === "parallel") for (const branch of node.branches) visit(branch.graph);
      if (node.kind === "iteration" || node.kind === "loop") visit(node.body);
      if (node.kind === "subworkflow") {
        add({ kind: "workflow-version", ...node.dependency });
        visit(node.workflow);
      }
      if (node.kind === "agent") add({
        kind: "agent-version",
        agentProfileId: node.childRun.agentProfileId,
        agentVersionId: node.childRun.agentVersionId,
        contentHash: node.childRun.contentHash,
      });
      if (node.kind === "human-approval") add({ kind: "approval-policy", policyId: node.suspend.policyId });
    }
  };
  visit(graph);
  return [...dependencies.values()];
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
  const diagnostics = [...validateWorkflowDraft(draft, {
    workflowVersions: options.workflowVersions,
    agentVersions: options.agentVersions,
    approvalPolicies: options.approvalPolicies,
    maxRuntimeMs: limits.maxRuntimeMs,
    maxIterationItems: limits.maxIterationItems,
    maxLoopIterations: limits.maxLoopIterations,
    maxNestedDepth: limits.maxNestedDepth,
    maxWaitingMs: limits.maxWaitingMs,
  }).diagnostics];
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

  const estimate = estimateNodes(draft.nodes, draft.edges, options);
  if (estimate.nodeCount > limits.maxNodes) diagnostics.push(diagnostic("compile.node-limit", `递归节点数 ${estimate.nodeCount} 超过编译上限 ${limits.maxNodes}。`, { kind: "workflow" }));
  if (estimate.edgeCount > limits.maxEdges) diagnostics.push(diagnostic("compile.edge-limit", `递归连边数 ${estimate.edgeCount} 超过编译上限 ${limits.maxEdges}。`, { kind: "workflow" }));
  if (estimate.estimatedSteps > limits.maxEstimatedSteps) diagnostics.push(diagnostic("compile.step-limit", `预计执行步数 ${estimate.estimatedSteps} 超过上限 ${limits.maxEstimatedSteps}。`, { kind: "workflow" }));
  if (estimate.maxParallelism > limits.maxParallelism) diagnostics.push(diagnostic("compile.parallelism-limit", `预计并行度 ${estimate.maxParallelism} 超过上限 ${limits.maxParallelism}。`, { kind: "workflow" }));
  if (estimate.maxNestedDepth > limits.maxNestedDepth) diagnostics.push(diagnostic("compile.nested-depth-limit", `嵌套深度 ${estimate.maxNestedDepth} 超过上限 ${limits.maxNestedDepth}。`, { kind: "workflow" }));
  if (diagnostics.some((item) => item.severity === "error")) return { ok: false, diagnostics };

  const compiledGraph = compileGraph(draft.nodes, draft.edges, options);
  const ir: WorkflowIR = {
    irVersion: WORKFLOW_IR_VERSION,
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    source,
    nodes: compiledGraph.nodes,
    edges: compiledGraph.edges,
    topology: compiledGraph.topology,
    resourceBudget: { limits, estimate },
    dependencies: collectDependencies(compiledGraph),
  };
  return { ok: true, ir, diagnostics };
}
