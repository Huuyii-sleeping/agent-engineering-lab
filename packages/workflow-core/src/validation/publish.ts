import type { VariableRef } from "../contracts/primitives.js";
import type { BuiltinWorkflowNode, WorkflowNode, WorkflowSubgraph } from "../contracts/nodes.js";
import type { WorkflowDiagnostic } from "../contracts/diagnostics.js";
import type { WorkflowReferenceResolvers } from "../contracts/references.js";
import type { WorkflowDraft, WorkflowVersion } from "../contracts/workflow.js";
import {
  workflowStageECapabilitiesForNodeType,
  type WorkflowStageECapabilityRegistry,
} from "../contracts/runtime.js";
import { findCycle, findReachableNodeIds } from "../graph/graph.js";
import { checkPortConnection } from "../ports/compatibility.js";
import { validateNodeConfig } from "../registry/builtins.js";
import { stableSerialize } from "../serialization/stable.js";
import { isSubgraphVariableRefAvailable, isVariableRefAvailable } from "../variables/scope.js";

/** 发布前静态校验结果。 */
export type WorkflowValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  diagnostics: WorkflowDiagnostic[];
};

/** 发布校验所需的资源预算和产品引用解析器。 */
export type WorkflowValidationOptions = WorkflowReferenceResolvers & {
  maxRuntimeMs?: number;
  maxIterationItems?: number;
  maxLoopIterations?: number;
  maxNestedDepth?: number;
  maxWaitingMs?: number;
  /** 提供时按单项 capability 阻止阶段 E 生产发布；省略时仅执行结构校验。 */
  stageECapabilities?: Partial<WorkflowStageECapabilityRegistry>;
};

function validateStageECapabilities(
  node: WorkflowNode,
  diagnostics: WorkflowDiagnostic[],
  options: WorkflowValidationOptions,
  containerId?: string,
): void {
  if (!options.stageECapabilities) return;
  for (const capability of workflowStageECapabilitiesForNodeType(node.type)) {
    if (options.stageECapabilities[capability] === true) continue;
    diagnostics.push(diagnostic(
      "runtime.capability-disabled",
      "error",
      `阶段 E 生产能力 ${capability} 尚未开放。`,
      { kind: "node", nodeId: node.id, containerId },
    ));
  }
}

function collectVariableRefs(value: unknown, refs: VariableRef[] = []): VariableRef[] {
  if (!value || typeof value !== "object") return refs;
  const record = value as Record<string, unknown>;
  if (record.kind === "variable" && record.ref && typeof record.ref === "object") {
    refs.push(record.ref as VariableRef);
    return refs;
  }
  if (typeof record.scope === "string" && ["workflow-input", "container-input", "node-output", "system", "environment", "secret", "loop"].includes(record.scope)) {
    refs.push(record as VariableRef);
    return refs;
  }
  for (const child of Array.isArray(value) ? value : Object.values(record)) collectVariableRefs(child, refs);
  return refs;
}

function inContainer(diagnostic: WorkflowDiagnostic, containerId: string): WorkflowDiagnostic {
  if (diagnostic.location.kind === "workflow") return {
    ...diagnostic,
    location: { kind: "node", nodeId: containerId, containerId },
  };
  return { ...diagnostic, location: { ...diagnostic.location, containerId } };
}

function validateSubgraphOutput(
  container: BuiltinWorkflowNode<"iteration"> | BuiltinWorkflowNode<"loop">,
  subgraph: WorkflowSubgraph,
  diagnostics: WorkflowDiagnostic[],
): void {
  for (const output of subgraph.outputs) {
    const value = output.value;
    if (value.scope !== "node-output") {
      diagnostics.push(diagnostic(
        "container.output-scope",
        "error",
        `容器输出「${output.name}」必须引用子图内部节点输出。`,
        { kind: "field", nodeId: container.id, containerId: container.id, fieldPath: ["body", "outputs", output.id, "value"] },
      ));
      continue;
    }
    const source = subgraph.nodes.find((node) => node.id === value.nodeId);
    if (!source?.ports.outputs.some((port) => port.id === value.portId)) {
      diagnostics.push(diagnostic(
        "container.output-missing",
        "error",
        `容器输出「${output.name}」引用了不存在的内部端口。`,
        { kind: "field", nodeId: container.id, containerId: container.id, fieldPath: ["body", "outputs", output.id, "value"] },
      ));
    }
  }
}

function validateSubgraph(
  container: BuiltinWorkflowNode<"iteration"> | BuiltinWorkflowNode<"loop">,
  diagnostics: WorkflowDiagnostic[],
  options: WorkflowValidationOptions,
  workflowId: string,
): void {
  const subgraph = container.config.body;
  const nodeIds = subgraph.nodes.map((node) => node.id);
  if (new Set(nodeIds).size !== nodeIds.length) diagnostics.push(diagnostic(
    "container.duplicate-node-id",
    "error",
    `容器 ${container.label} 的内部节点 id 必须唯一。`,
    { kind: "field", nodeId: container.id, containerId: container.id, fieldPath: ["body", "nodes"] },
  ));
  const edgeIds = subgraph.edges.map((edge) => edge.id);
  if (new Set(edgeIds).size !== edgeIds.length) diagnostics.push(diagnostic(
    "container.duplicate-edge-id",
    "error",
    `容器 ${container.label} 的内部连边 id 必须唯一。`,
    { kind: "field", nodeId: container.id, containerId: container.id, fieldPath: ["body", "edges"] },
  ));
  const cycle = findCycle(subgraph.nodes, subgraph.edges);
  if (cycle) diagnostics.push(diagnostic(
    "container.cycle",
    "error",
    `容器 ${container.label} 的子图存在环：${cycle.join(" → ")}。`,
    { kind: "node", nodeId: container.id, containerId: container.id },
  ));
  const incomingNodeIds = new Set(subgraph.edges.map((edge) => edge.target.nodeId));
  const entryNodeIds = subgraph.nodes.filter((node) => !incomingNodeIds.has(node.id)).map((node) => node.id);
  if (subgraph.nodes.length > 0 && entryNodeIds.length !== 1) diagnostics.push(diagnostic(
    "container.entry-count",
    "error",
    `容器 ${container.label} 的子图必须有且只有一个入口，当前为 ${entryNodeIds.length} 个。`,
    { kind: "field", nodeId: container.id, containerId: container.id, fieldPath: ["body", "nodes"] },
  ));
  if (entryNodeIds[0]) {
    const reachable = findReachableNodeIds(subgraph.nodes, subgraph.edges, [entryNodeIds[0]]);
    for (const node of subgraph.nodes) if (!reachable.has(node.id)) diagnostics.push(diagnostic(
      "container.node.unreachable",
      "error",
      `内部节点「${node.label}」无法从容器入口到达。`,
      { kind: "node", nodeId: node.id, containerId: container.id },
    ));
  }
  for (const edge of subgraph.edges) {
    const result = checkPortConnection(subgraph.nodes, edge.source, edge.target);
    if (!result.valid) diagnostics.push(diagnostic(
      "container.edge.invalid-port",
      "error",
      result.reason,
      { kind: "edge", edgeId: edge.id, containerId: container.id },
    ));
  }
  for (const node of subgraph.nodes) {
    diagnostics.push(...validateNodeConfig(node).map((item) => inContainer(item, container.id)));
    validateStageECapabilities(node, diagnostics, options, container.id);
    for (const port of node.ports.inputs.filter((item) => item.required)) {
      if (!subgraph.edges.some((edge) => edge.target.nodeId === node.id && edge.target.portId === port.id && edge.status !== "needs-repair")) {
        diagnostics.push(diagnostic(
          "container.port.required",
          "error",
          `必填输入「${port.name}」尚未在容器内连接。`,
          { kind: "port", nodeId: node.id, portId: port.id, containerId: container.id },
        ));
      }
    }
    const config = node.kind === "builtin" ? node.config : node.original;
    const topLevelConfig = node.kind === "builtin" && (node.type === "iteration" || node.type === "loop")
      ? { ...node.config, body: undefined }
      : config;
    for (const ref of collectVariableRefs(topLevelConfig)) {
      const platformScope = ref.scope === "system" || ref.scope === "environment" || ref.scope === "secret";
      if (!platformScope && !isSubgraphVariableRefAvailable(container, node.id, ref)) diagnostics.push(diagnostic(
        "container.variable.unavailable",
        "error",
        "变量引用不属于当前容器、不可达或未通过容器输入声明。",
        { kind: "node", nodeId: node.id, containerId: container.id },
      ));
    }
    if (node.kind === "builtin") validateProductReference(node, workflowId, diagnostics, options, container.id);
    if (node.kind === "builtin" && (node.type === "iteration" || node.type === "loop")) validateSubgraph(node, diagnostics, options, workflowId);
  }
  validateSubgraphOutput(container, subgraph, diagnostics);
}

function nestedSubworkflowNodes(version: WorkflowVersion): BuiltinWorkflowNode<"subworkflow">[] {
  const references: BuiltinWorkflowNode<"subworkflow">[] = [];
  const visit = (nodes: readonly WorkflowNode[]): void => {
    for (const node of nodes) {
      if (node.kind !== "builtin") continue;
      if (node.type === "subworkflow") references.push(node);
      if (node.type === "iteration" || node.type === "loop") visit(node.config.body.nodes);
    }
  };
  visit(version.nodes);
  return references;
}

function validateSubworkflowDependency(
  node: BuiltinWorkflowNode<"subworkflow">,
  rootWorkflowId: string,
  diagnostics: WorkflowDiagnostic[],
  options: WorkflowValidationOptions,
  path: string[],
  containerId?: string,
): void {
  const location = { kind: "field" as const, nodeId: node.id, containerId, fieldPath: ["workflowId", "versionId", "contentHash"] };
  if (!options.workflowVersions) {
    diagnostics.push(diagnostic("subworkflow.resolver-missing", "error", "未配置已发布 WorkflowVersion 解析器。", location));
    return;
  }
  const version = options.workflowVersions.resolvePublishedVersion(node.config.workflowId, node.config.versionId);
  if (!version || version.workflowId !== node.config.workflowId || version.id !== node.config.versionId) {
    diagnostics.push(diagnostic("subworkflow.version-missing", "error", "Subworkflow 引用的不可变发布版本不存在。", location));
    return;
  }
  if (version.contentHash !== node.config.contentHash) diagnostics.push(diagnostic(
    "subworkflow.hash-mismatch",
    "error",
    "Subworkflow contentHash 与发布版本不一致。",
    location,
  ));
  const nextPath = [...path, version.workflowId];
  if (path.includes(version.workflowId) || version.workflowId === rootWorkflowId) {
    diagnostics.push(diagnostic(
      "subworkflow.recursive",
      "error",
      `Subworkflow 存在递归依赖：${nextPath.join(" → ")}。`,
      location,
    ));
    return;
  }
  const maxDepth = options.maxNestedDepth ?? 5;
  if (nextPath.length - 1 > maxDepth) {
    diagnostics.push(diagnostic(
      "subworkflow.depth-limit",
      "error",
      `Subworkflow 嵌套深度 ${nextPath.length - 1} 超过上限 ${maxDepth}。`,
      location,
    ));
    return;
  }
  for (const child of nestedSubworkflowNodes(version)) {
    validateSubworkflowDependency(child, rootWorkflowId, diagnostics, options, nextPath);
  }
}

function validateProductReference(
  node: Exclude<WorkflowNode, { kind: "unknown" }>,
  workflowId: string,
  diagnostics: WorkflowDiagnostic[],
  options: WorkflowValidationOptions,
  containerId?: string,
): void {
  if (node.type === "subworkflow") {
    validateSubworkflowDependency(node, workflowId, diagnostics, options, [workflowId], containerId);
    return;
  }
  if (node.type === "agent") {
    const location = { kind: "field" as const, nodeId: node.id, containerId, fieldPath: ["agentProfileId", "agentVersionId"] };
    if (!options.agentVersions) {
      diagnostics.push(diagnostic("agent.version-resolver-missing", "error", "未配置已发布 Agent version 解析器。", location));
      return;
    }
    const version = options.agentVersions.resolvePublishedVersion(node.config.agentProfileId, node.config.agentVersionId);
    if (!version) {
      diagnostics.push(diagnostic("agent.version-missing", "error", "Agent 节点引用的发布版本不存在或不可用。", location));
      return;
    }
    if (version.id !== node.config.agentVersionId || version.agentProfileId !== node.config.agentProfileId) {
      diagnostics.push(diagnostic("agent.version-identity-mismatch", "error", "Agent 节点引用与解析到的发布版本身份不一致。", location));
      return;
    }
    if (stableSerialize(version.outputSchema) !== stableSerialize(node.config.outputSchema)) {
      diagnostics.push(diagnostic(
        "agent.output-schema-mismatch",
        "error",
        "Agent 节点输出 schema 与发布版本不一致。",
        { kind: "field", nodeId: node.id, containerId, fieldPath: ["outputSchema"] },
      ));
    }
    return;
  }
  if (node.type === "human-approval") {
    const location = { kind: "field" as const, nodeId: node.id, containerId, fieldPath: ["policyId"] };
    if (!options.approvalPolicies) diagnostics.push(diagnostic("approval.policy-resolver-missing", "error", "未配置审批策略解析器。", location));
    else if (!options.approvalPolicies.hasPolicy(node.config.policyId)) diagnostics.push(diagnostic(
      "approval.policy-missing",
      "error",
      "Human Approval 引用的审批策略不存在或不可用。",
      location,
    ));
  }
}

function nodesBeforeMerge(draft: WorkflowDraft, startNodeId: string, mergeNodeId: string): { found: boolean; nodes: Set<string> } {
  const nodes = new Set<string>();
  const queue = [startNodeId];
  let found = startNodeId === mergeNodeId;
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === mergeNodeId) {
      found = true;
      continue;
    }
    if (nodes.has(current)) continue;
    nodes.add(current);
    for (const edge of draft.edges.filter((item) => item.source.nodeId === current)) queue.push(edge.target.nodeId);
  }
  return { found, nodes };
}

function validateParallelMerges(draft: WorkflowDraft, diagnostics: WorkflowDiagnostic[]): void {
  const merges = draft.nodes.filter((node): node is BuiltinWorkflowNode<"merge"> => node.kind === "builtin" && node.type === "merge");
  for (const merge of merges) {
    const parallel = draft.nodes.find((node): node is BuiltinWorkflowNode<"parallel"> => (
      node.id === merge.config.parallelNodeId && node.kind === "builtin" && node.type === "parallel"
    ));
    if (!parallel) {
      diagnostics.push(diagnostic(
        "merge.parallel-missing",
        "error",
        `Merge「${merge.label}」引用的 Parallel 不存在或类型无效。`,
        { kind: "field", nodeId: merge.id, fieldPath: ["parallelNodeId"] },
      ));
      continue;
    }
    const branchSlices = new Map<string, Set<string>>();
    for (const branch of parallel.config.branches) {
      const outgoing = draft.edges.filter((edge) => edge.source.nodeId === parallel.id && edge.source.portId === branch.id);
      if (outgoing.length !== 1) {
        diagnostics.push(diagnostic(
          "parallel.branch-edge",
          "error",
          `Parallel 分支「${branch.label}」必须且只能连接一个活动入口。`,
          { kind: "port", nodeId: parallel.id, portId: branch.id },
        ));
        continue;
      }
      const slice = nodesBeforeMerge(draft, outgoing[0]!.target.nodeId, merge.id);
      if (!slice.found) diagnostics.push(diagnostic(
        "parallel.merge-unreachable",
        "error",
        `Parallel 分支「${branch.label}」无法到达 Merge「${merge.label}」。`,
        { kind: "port", nodeId: parallel.id, portId: branch.id },
      ));
      branchSlices.set(branch.id, slice.nodes);
    }
    const branches = [...branchSlices.entries()];
    for (let leftIndex = 0; leftIndex < branches.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < branches.length; rightIndex += 1) {
        const [leftId, leftNodes] = branches[leftIndex]!;
        const [rightId, rightNodes] = branches[rightIndex]!;
        const overlap = [...leftNodes].find((nodeId) => rightNodes.has(nodeId));
        if (overlap) diagnostics.push(diagnostic(
          "parallel.branch-overlap",
          "error",
          `Parallel 分支 ${leftId} 与 ${rightId} 在 Merge 前重叠于节点 ${overlap}。`,
          { kind: "node", nodeId: overlap },
        ));
      }
    }
  }
}

function diagnostic(
  code: string,
  severity: "error" | "warning",
  message: string,
  location: WorkflowDiagnostic["location"],
): WorkflowDiagnostic {
  return { code, severity, message, location };
}

/** 校验图结构、节点配置、端口、变量、必填输入和首期资源上限。 */
export function validateWorkflowDraft(draft: WorkflowDraft, options: WorkflowValidationOptions = {}): WorkflowValidationResult {
  const diagnostics: WorkflowDiagnostic[] = [];
  if (draft.nodes.length === 0) diagnostics.push(diagnostic("workflow.empty", "error", "画布为空，请先添加节点。", { kind: "workflow" }));
  if (draft.nodes.length > 200) diagnostics.push(diagnostic("workflow.node-limit", "error", `节点数 ${draft.nodes.length} 超过上限 200。`, { kind: "workflow" }));
  if (draft.edges.length > 400) diagnostics.push(diagnostic("workflow.edge-limit", "error", `连边数 ${draft.edges.length} 超过上限 400。`, { kind: "workflow" }));

  const starts = draft.nodes.filter((node) => node.type === "start");
  if (starts.length !== 1) diagnostics.push(diagnostic("workflow.start-count", "error", starts.length === 0 ? "缺少「开始」节点，流程无法启动。" : `存在 ${starts.length} 个「开始」节点，只能有 1 个。`, { kind: "workflow" }));
  if (!draft.nodes.some((node) => node.type === "end")) diagnostics.push(diagnostic("workflow.missing-end", "warning", "缺少「结束」节点，流程没有明确出口。", { kind: "workflow" }));

  if (starts.length > 0) {
    const reachable = findReachableNodeIds(draft.nodes, draft.edges, starts.map((node) => node.id));
    for (const node of draft.nodes) if (!reachable.has(node.id)) diagnostics.push(diagnostic("node.unreachable", "error", `节点「${node.label}」无法从开始节点到达。`, { kind: "node", nodeId: node.id }));
  }
  const cycle = findCycle(draft.nodes, draft.edges);
  if (cycle) diagnostics.push(diagnostic("workflow.cycle", "error", `流程存在环：${cycle.join(" → ")}。`, { kind: "workflow" }));

  for (const edge of draft.edges) {
    const result = checkPortConnection(draft.nodes, edge.source, edge.target);
    if (!result.valid) diagnostics.push(diagnostic("edge.invalid-port", "error", result.reason, { kind: "edge", edgeId: edge.id }));
  }
  for (const node of draft.nodes) {
    diagnostics.push(...validateNodeConfig(node));
    validateStageECapabilities(node, diagnostics, options);
    for (const port of node.ports.inputs.filter((item) => item.required)) {
      if (!draft.edges.some((edge) => edge.target.nodeId === node.id && edge.target.portId === port.id && edge.status !== "needs-repair")) diagnostics.push(diagnostic("port.required", "error", `必填输入「${port.name}」尚未连接。`, { kind: "port", nodeId: node.id, portId: port.id }));
    }
    const config = node.kind === "builtin" ? node.config : node.original;
    const topLevelConfig = node.kind === "builtin" && (node.type === "iteration" || node.type === "loop")
      ? { ...node.config, body: undefined }
      : config;
    for (const ref of collectVariableRefs(topLevelConfig)) {
      if (!isVariableRefAvailable(draft, node.id, ref, {
        system: [{ key: "runId", dataType: "string" }, { key: "currentTime", dataType: "string" }],
        environment: [{ key: "ORBIT_ENV", dataType: "string" }],
      })) diagnostics.push(diagnostic("variable.unavailable", "error", "变量引用不可达、已失效或不在当前作用域。", { kind: "node", nodeId: node.id }));
    }
    if (node.kind === "builtin") validateProductReference(node, draft.id, diagnostics, options);
    if (node.kind === "builtin" && node.type === "iteration") {
      if (node.config.items.kind === "literal" && !Array.isArray(node.config.items.value)) diagnostics.push(diagnostic(
        "iteration.items-array",
        "error",
        "Iteration 字面量输入必须为数组。",
        { kind: "field", nodeId: node.id, fieldPath: ["items", "value"] },
      ));
      if (node.config.items.kind === "literal" && Array.isArray(node.config.items.value) && node.config.items.value.length > node.config.maxItems) diagnostics.push(diagnostic(
        "iteration.items-limit",
        "error",
        `Iteration 输入元素数 ${node.config.items.value.length} 超过节点上限 ${node.config.maxItems}。`,
        { kind: "field", nodeId: node.id, fieldPath: ["items", "value"] },
      ));
      if (node.config.maxItems > (options.maxIterationItems ?? 1_000)) diagnostics.push(diagnostic(
        "iteration.budget-limit",
        "error",
        `Iteration maxItems ${node.config.maxItems} 超过 Workflow 预算 ${options.maxIterationItems ?? 1_000}。`,
        { kind: "field", nodeId: node.id, fieldPath: ["maxItems"] },
      ));
      validateSubgraph(node, diagnostics, options, draft.id);
    }
    if (node.kind === "builtin" && node.type === "loop") {
      if (node.config.maxIterations > (options.maxLoopIterations ?? 1_000)) diagnostics.push(diagnostic(
        "loop.iteration-budget",
        "error",
        `Loop maxIterations ${node.config.maxIterations} 超过 Workflow 预算 ${options.maxLoopIterations ?? 1_000}。`,
        { kind: "field", nodeId: node.id, fieldPath: ["maxIterations"] },
      ));
      if (node.config.timeoutMs > (options.maxRuntimeMs ?? 86_400_000)) diagnostics.push(diagnostic(
        "loop.runtime-budget",
        "error",
        `Loop timeoutMs ${node.config.timeoutMs} 超过 Workflow 运行预算 ${options.maxRuntimeMs ?? 86_400_000}。`,
        { kind: "field", nodeId: node.id, fieldPath: ["timeoutMs"] },
      ));
      validateSubgraph(node, diagnostics, options, draft.id);
    }
    if (node.kind === "builtin" && node.type === "human-approval" && node.config.deadlineMs > (options.maxWaitingMs ?? 30 * 24 * 60 * 60 * 1_000)) diagnostics.push(diagnostic(
      "approval.waiting-budget",
      "error",
      `审批期限 ${node.config.deadlineMs} 超过 Workflow waiting 预算 ${options.maxWaitingMs ?? 30 * 24 * 60 * 60 * 1_000}。`,
      { kind: "field", nodeId: node.id, fieldPath: ["deadlineMs"] },
    ));
  }
  validateParallelMerges(draft, diagnostics);
  const errors = diagnostics.filter((item) => item.severity === "error").map((item) => item.message);
  const warnings = diagnostics.filter((item) => item.severity === "warning").map((item) => item.message);
  return { ok: errors.length === 0, errors, warnings, diagnostics };
}
