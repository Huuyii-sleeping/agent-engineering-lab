import { createHash } from "node:crypto";
import type {
  WorkflowIR,
  WorkflowIRGraph,
} from "@orbit/workflow-core";
import { stableSerialize } from "@orbit/workflow-core";
import type { Mastra } from "@mastra/core/mastra";
import { createWorkflow, type AnyWorkflow } from "@mastra/core/workflows";
import type { WorkflowExecutorRegistry } from "../../workflows/executor-registry.js";
import {
  MASTRA_WORKFLOW_FRAME_SCHEMA,
  createMastraBranchMergeStep,
  createMastraBranchPassStep,
  createMastraWorkflowNodeStep,
} from "./frame.js";
import { createMastraIterationContainerWorkflow } from "./iteration-steps.js";
import { createMastraLoopContainerWorkflow } from "./loop-steps.js";
import { createMastraParallelContainerWorkflow } from "./parallel-steps.js";
import { createMastraSubworkflowContainerWorkflow } from "./subworkflow-steps.js";

export const MASTRA_WORKFLOW_ADAPTER_VERSION = "mastra-workflow-v2";

/** 编译后的 Mastra Workflow 及其稳定缓存身份。 */
export type CompiledMastraWorkflow = {
  cacheKey: string;
  runtimeWorkflowId: string;
  workflow: AnyWorkflow;
  ir: WorkflowIR;
};

type CompilerOptions = {
  mastra: Pick<Mastra, "addWorkflow">;
  executors: WorkflowExecutorRegistry;
};

function contentIdentity(ir: WorkflowIR): string {
  if (ir.source.kind === "version") {
    const dependencyHash = createHash("sha256").update(stableSerialize(ir.dependencies)).digest("hex");
    return `${ir.source.versionId}:${ir.source.contentHash}:${dependencyHash}`;
  }
  return createHash("sha256").update(stableSerialize(ir)).digest("hex");
}

function workflowCacheKey(ir: WorkflowIR): string {
  return `${ir.source.workflowId}:${contentIdentity(ir)}:${MASTRA_WORKFLOW_ADAPTER_VERSION}`;
}

function runtimeWorkflowId(cacheKey: string): string {
  return `orbit-workflow-${createHash("sha256").update(cacheKey).digest("hex").slice(0, 24)}`;
}

type WorkflowComponent = ReturnType<typeof createMastraWorkflowNodeStep> | AnyWorkflow;

function reachable(graph: WorkflowIRGraph, sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) return true;
  const pending = [sourceId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const dependent of graph.topology.dependents[current] ?? []) {
      if (dependent === targetId) return true;
      pending.push(dependent);
    }
  }
  return false;
}

function commonJoin(graph: WorkflowIRGraph, orderedNodeIds: string[], targets: string[]): string | undefined {
  return orderedNodeIds.find((nodeId) => targets.every((target) => reachable(graph, target, nodeId)));
}

function branchNodeIds(
  graph: WorkflowIRGraph,
  orderedNodeIds: string[],
  targetId: string,
  joinId: string | undefined,
): string[] {
  return orderedNodeIds.filter((nodeId) => {
    if (nodeId === joinId) return false;
    if (!reachable(graph, targetId, nodeId)) return false;
    return joinId === undefined || !reachable(graph, joinId, nodeId);
  });
}

function executableGraph(ir: WorkflowIR, graph: WorkflowIRGraph): WorkflowIR {
  return { ...ir, nodes: graph.nodes, edges: graph.edges, topology: graph.topology };
}

function controlledNodeIds(graph: WorkflowIRGraph): Set<string> {
  const controlled = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind !== "parallel") continue;
    controlled.add(node.merge.nodeId);
    for (const branch of node.branches) {
      for (const branchNode of branch.graph.nodes) controlled.add(branchNode.id);
    }
  }
  return controlled;
}

function createGraphComponents(
  ir: WorkflowIR,
  graph: WorkflowIRGraph,
  workflowId: string,
  executors: WorkflowExecutorRegistry,
  options: { captureUnhandledFailure?: boolean } = {},
): Map<string, WorkflowComponent> {
  const graphIr = executableGraph(ir, graph);
  const controlled = controlledNodeIds(graph);
  const components = new Map<string, WorkflowComponent>();
  for (const node of graph.nodes) {
    if (controlled.has(node.id)) continue;
    if (node.kind === "executable") {
      components.set(node.id, createMastraWorkflowNodeStep(graphIr, node, executors, options));
      continue;
    }
    if (node.kind === "parallel") {
      const branches = new Map(node.branches.map((branch) => [
        branch.id,
        createGraphWorkflow(
          ir,
          branch.graph,
          `${workflowId}-${node.id}-${branch.id}`,
          executors,
          { captureUnhandledFailure: node.config.failurePolicy === "collect" },
        ),
      ]));
      components.set(node.id, createMastraParallelContainerWorkflow(
        node,
        branches,
        ir.resourceBudget.limits.maxParallelism,
      ));
      continue;
    }
    if (node.kind === "iteration") {
      const body = createGraphWorkflow(
        ir,
        node.body,
        `${workflowId}-${node.id}-body`,
        executors,
        { captureUnhandledFailure: node.config.failurePolicy !== "fail-fast" },
      );
      components.set(node.id, createMastraIterationContainerWorkflow(node, body, {
        maxParallelism: ir.resourceBudget.limits.maxParallelism,
        maxItems: ir.resourceBudget.limits.maxIterationItems,
      }));
      continue;
    }
    if (node.kind === "loop") {
      const body = createGraphWorkflow(ir, node.body, `${workflowId}-${node.id}-body`, executors);
      components.set(node.id, createMastraLoopContainerWorkflow(node, body, {
        maxIterations: ir.resourceBudget.limits.maxLoopIterations,
        maxRuntimeMs: ir.resourceBudget.limits.maxRuntimeMs,
      }));
      continue;
    }
    if (node.kind === "subworkflow") {
      const child = createGraphWorkflow(
        ir,
        node.workflow,
        `${workflowId}-${node.id}-${node.dependency.versionId}`,
        executors,
        { captureUnhandledFailure: true },
      );
      components.set(node.id, createMastraSubworkflowContainerWorkflow(node, child));
      continue;
    }
    if (node.kind === "agent") {
      components.set(node.id, createMastraWorkflowNodeStep(graphIr, node, executors, options));
      continue;
    }
    if (node.kind === "human-approval") {
      components.set(node.id, createMastraWorkflowNodeStep(graphIr, node, executors, options));
      continue;
    }
    if (node.kind === "merge") continue;
    throw new Error("Mastra Workflow compiler 收到未知 IR 节点。");
  }
  return components;
}

function appendStructuredFlow(
  builder: AnyWorkflow,
  graph: WorkflowIRGraph,
  orderedNodeIds: string[],
  components: Map<string, WorkflowComponent>,
  workflowId: string,
): AnyWorkflow {
  orderedNodeIds = orderedNodeIds.filter((nodeId) => components.has(nodeId));
  if (orderedNodeIds.length === 0) return builder;
  const routerIndex = orderedNodeIds.findIndex((nodeId) => {
    const type = graph.nodes.find((node) => node.id === nodeId)?.type;
    return type === "condition" || type === "human-approval";
  });
  if (routerIndex < 0) {
    let current = builder;
    for (const nodeId of orderedNodeIds) current = current.then(components.get(nodeId)! as never) as AnyWorkflow;
    return current;
  }

  let current = builder;
  for (const nodeId of orderedNodeIds.slice(0, routerIndex + 1)) {
    current = current.then(components.get(nodeId)! as never) as AnyWorkflow;
  }
  const routerId = orderedNodeIds[routerIndex]!;
  const outgoing = graph.edges.filter((edge) => edge.sourceNodeId === routerId);
  if (outgoing.length === 0) throw new Error(`路由节点 ${routerId} 没有任何出边。`);
  const remaining = orderedNodeIds.slice(routerIndex + 1);
  const joinId = commonJoin(graph, remaining, outgoing.map((edge) => edge.targetNodeId));
  const assigned = new Set<string>();
  const branches: Array<readonly [
    (input: { inputData: { selectedPorts: Record<string, string[]>; instanceFailure?: unknown } }) => Promise<boolean>,
    WorkflowComponent,
  ]> = [];
  branches.push([
    async ({ inputData }) => inputData.instanceFailure !== undefined,
    createMastraBranchPassStep(`${routerId}-failure-pass`),
  ]);
  branches.push(...outgoing.map((edge) => {
    const ids = branchNodeIds(graph, remaining, edge.targetNodeId, joinId);
    for (const nodeId of ids) {
      if (assigned.has(nodeId)) throw new Error(`路由节点 ${routerId} 的分支在公共汇合点前重叠：${nodeId}。`);
      assigned.add(nodeId);
    }
    const component = ids.length === 0
      ? createMastraBranchPassStep(`${routerId}-${edge.sourcePortId}-pass`)
      : ids.length === 1
        ? components.get(ids[0]!)!
        : appendStructuredFlow(
          createWorkflow({
            id: `${workflowId}-${routerId}-${edge.sourcePortId}`,
            inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
            outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
          }) as AnyWorkflow,
          graph,
          ids,
          components,
          `${workflowId}-${routerId}-${edge.sourcePortId}`,
        ).commit();
    return [
      async ({ inputData }: { inputData: { selectedPorts: Record<string, string[]> } }) => (
        inputData.selectedPorts[routerId]?.includes(edge.sourcePortId) === true
      ),
      component,
    ] as const;
  }));
  current = current.branch(branches as never) as AnyWorkflow;
  current = current.then(createMastraBranchMergeStep(
    `${routerId}-merge`,
    branches.map((branch) => branch[1].id),
  ) as never) as AnyWorkflow;
  const suffix = joinId ? remaining.slice(remaining.indexOf(joinId)) : [];
  return appendStructuredFlow(current, graph, suffix, components, workflowId);
}

function createGraphWorkflow(
  ir: WorkflowIR,
  graph: WorkflowIRGraph,
  workflowId: string,
  executors: WorkflowExecutorRegistry,
  options: { captureUnhandledFailure?: boolean } = {},
): AnyWorkflow {
  const components = createGraphComponents(ir, graph, workflowId, executors, options);
  return appendStructuredFlow(
    createWorkflow({
      id: workflowId,
      inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    }) as AnyWorkflow,
    graph,
    graph.topology.orderedNodeIds,
    components,
    workflowId,
  ).commit();
}

/** 将 Workflow IR 编译、缓存并注册为共享 Mastra Instance 中的执行产物。 */
export class MastraWorkflowCompilerAdapter {
  private readonly cache = new Map<string, CompiledMastraWorkflow>();

  constructor(private readonly options: CompilerOptions) {}

  compile(ir: WorkflowIR, options: { targetNodeId?: string } = {}): CompiledMastraWorkflow {
    const cacheKey = `${workflowCacheKey(ir)}${options.targetNodeId ? `:node-test:${options.targetNodeId}` : ""}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const id = runtimeWorkflowId(cacheKey);
    const graph: WorkflowIRGraph = { nodes: ir.nodes, edges: ir.edges, topology: ir.topology };
    let workflow: AnyWorkflow;
    if (options.targetNodeId) {
      const node = ir.nodes.find((candidate) => candidate.id === options.targetNodeId);
      if (!node) throw new Error(`Workflow 节点 ${options.targetNodeId} 不存在。`);
      if (node.kind !== "executable") throw new Error(`阶段 E 控制节点 ${node.id} 暂不支持 node-test。`);
      workflow = (createWorkflow({
        id,
        inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
        outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      }) as AnyWorkflow)
        .then(createMastraWorkflowNodeStep(ir, node, this.options.executors) as never)
        .commit();
    } else {
      workflow = createGraphWorkflow(ir, graph, id, this.options.executors);
    }
    this.options.mastra.addWorkflow(workflow, id);
    const compiled = { cacheKey, runtimeWorkflowId: id, workflow, ir };
    this.cache.set(cacheKey, compiled);
    return compiled;
  }
}
