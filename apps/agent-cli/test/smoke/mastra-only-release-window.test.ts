import { performance } from "node:perf_hooks";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConsoleLogger, LogLevel } from "@mastra/core/logger";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import {
  WORKFLOW_SCHEMA_VERSION,
  builtinNodeRegistry,
  isTerminalWorkflowRunStatus,
  type AgentVersion,
  type WorkflowDraft,
  type WorkflowStageECapabilityRegistry,
  type WorkflowVersion,
} from "@orbit/workflow-core";
import type { AgentRuntimePort, StartWorkflowRunCommand } from "@orbit/runtime-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { MastraWorkflowRuntimeAdapter } from "../../src/mastra/adapters/workflow-runtime-adapter.js";
import { MastraWorkflowCompilerAdapter } from "../../src/mastra/workflows/compiler-adapter.js";
import { MastraWorkflowAgentNodeExecutor } from "../../src/mastra/workflows/agent-node-executor.js";
import { createBuiltinWorkflowExecutorRegistry } from "../../src/workflows/executors/index.js";

let root = "";
let mastra: Mastra | null = null;

afterEach(async () => {
  await mastra?.shutdown();
  mastra = null;
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

const ENABLED_STAGE_E_CAPABILITIES = {
  parallelMerge: true,
  iteration: true,
  boundedLoop: true,
  nestedWorkflow: true,
  agentNode: true,
  humanApproval: true,
  restartResume: true,
} satisfies WorkflowStageECapabilityRegistry;

function node<T extends "start" | "template" | "end" | "parallel" | "merge" | "iteration" | "loop" | "subworkflow" | "agent">(
  type: T,
  id: string,
  config?: unknown,
) {
  const definition = builtinNodeRegistry.get(type)!;
  const resolved = config ?? definition.createDefaultConfig();
  return {
    kind: "builtin" as const,
    id,
    type,
    version: definition.version,
    label: id,
    position: { x: 0, y: 0 },
    config: resolved as never,
    ports: definition.createPorts(resolved as never),
  };
}

function parallelWorkflow(): WorkflowDraft {
  const parallel = builtinNodeRegistry.get("parallel")!.createDefaultConfig();
  parallel.branches = [{ id: "left", label: "Left" }, { id: "right", label: "Right" }];
  parallel.maxConcurrency = 2;
  const merge = builtinNodeRegistry.get("merge")!.createDefaultConfig();
  merge.parallelNodeId = "parallel";
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "stage-e-release-parallel",
    name: "Stage E parallel",
    summary: "",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      node("start", "start", { inputs: [] }),
      node("parallel", "parallel", parallel),
      node("template", "left", { template: "left", variables: {} }),
      node("template", "right", { template: "right", variables: {} }),
      node("merge", "merge", merge),
      node("end", "end", { outputs: [] }),
    ],
    edges: [
      { id: "start-parallel", source: { nodeId: "start", portId: "out" }, target: { nodeId: "parallel", portId: "in" } },
      { id: "parallel-left", source: { nodeId: "parallel", portId: "left" }, target: { nodeId: "left", portId: "in" } },
      { id: "parallel-right", source: { nodeId: "parallel", portId: "right" }, target: { nodeId: "right", portId: "in" } },
      { id: "left-merge", source: { nodeId: "left", portId: "text" }, target: { nodeId: "merge", portId: "branches" } },
      { id: "right-merge", source: { nodeId: "right", portId: "text" }, target: { nodeId: "merge", portId: "branches" } },
      { id: "merge-end", source: { nodeId: "merge", portId: "result" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
}

function iterationWorkflow(): WorkflowDraft {
  const iteration = builtinNodeRegistry.get("iteration")!.createDefaultConfig();
  iteration.items = { kind: "literal", value: ["a", "b", "c"] };
  iteration.maxItems = 3;
  iteration.maxConcurrency = 2;
  const body = node("template", "body", {
    template: "{{item}}-{{index}}",
    variables: {
      item: { kind: "variable", ref: { scope: "loop", containerNodeId: "iteration", key: "item" } },
      index: { kind: "variable", ref: { scope: "loop", containerNodeId: "iteration", key: "index" } },
    },
  });
  iteration.body.nodes = [body];
  iteration.body.outputs = [{
    id: "text",
    name: "Text",
    dataType: "string",
    value: { scope: "node-output", nodeId: "body", portId: "text" },
  }];
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "stage-e-release-iteration",
    name: "Stage E iteration",
    summary: "",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [node("start", "start", { inputs: [] }), node("iteration", "iteration", iteration), node("end", "end", { outputs: [] })],
    edges: [
      { id: "start-iteration", source: { nodeId: "start", portId: "out" }, target: { nodeId: "iteration", portId: "items" } },
      { id: "iteration-end", source: { nodeId: "iteration", portId: "results" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
}

function loopWorkflow(): WorkflowDraft {
  const loop = builtinNodeRegistry.get("loop")!.createDefaultConfig();
  loop.condition = "state !== 'approved'";
  loop.maxIterations = 3;
  loop.initialVariables = [{ id: "state", name: "State", dataType: "string", value: { kind: "literal", value: "pending" } }];
  loop.body.nodes = [node("template", "body", { template: "approved", variables: {} })];
  loop.body.outputs = [{
    id: "state",
    name: "State",
    dataType: "string",
    value: { scope: "node-output", nodeId: "body", portId: "text" },
  }];
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "stage-e-release-loop",
    name: "Stage E loop",
    summary: "",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [node("start", "start", { inputs: [] }), node("loop", "loop", loop), node("end", "end", { outputs: [] })],
    edges: [
      { id: "start-loop", source: { nodeId: "start", portId: "out" }, target: { nodeId: "loop", portId: "in" } },
      { id: "loop-end", source: { nodeId: "loop", portId: "output:state" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
}

function subworkflowFixture(): { parent: WorkflowDraft; child: WorkflowVersion } {
  const child: WorkflowVersion = {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "stage-e-child-v1",
    workflowId: "stage-e-child",
    version: 1,
    contentHash: "stage-e-child-hash-v1",
    createdAt: 1,
    createdBy: "test",
    nodes: [
      node("start", "start", { inputs: [] }),
      node("template", "template", { template: "child", variables: {} }),
      node("end", "end", { outputs: [{ id: "text", name: "Text", value: { scope: "node-output", nodeId: "template", portId: "text" } }] }),
    ],
    edges: [
      { id: "start-template", source: { nodeId: "start", portId: "out" }, target: { nodeId: "template", portId: "in" } },
      { id: "template-end", source: { nodeId: "template", portId: "text" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
  const subworkflow = builtinNodeRegistry.get("subworkflow")!.createDefaultConfig();
  subworkflow.workflowId = child.workflowId;
  subworkflow.versionId = child.id;
  subworkflow.contentHash = child.contentHash;
  subworkflow.outputBindings = [{ outputId: "text", name: "Text", dataType: "string" }];
  return {
    child,
    parent: {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "stage-e-release-subworkflow",
      name: "Stage E subworkflow",
      summary: "",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      nodes: [node("start", "start", { inputs: [] }), node("subworkflow", "subworkflow", subworkflow), node("end", "end", { outputs: [] })],
      edges: [
        { id: "start-child", source: { nodeId: "start", portId: "out" }, target: { nodeId: "subworkflow", portId: "in" } },
        { id: "child-end", source: { nodeId: "subworkflow", portId: "output:text" }, target: { nodeId: "end", portId: "in" } },
      ],
    },
  };
}

function agentFixture(): { workflow: WorkflowDraft; version: AgentVersion } {
  const agent = builtinNodeRegistry.get("agent")!.createDefaultConfig();
  const version: AgentVersion = {
    id: "stage-e-agent-v1",
    agentProfileId: "stage-e-agent",
    version: 1,
    contentHash: "stage-e-agent-hash-v1",
    name: "Stage E Agent",
    description: "",
    instructions: ["Return a stable result."],
    toolPolicy: { allowedToolIds: [] },
    skillPolicy: { bindings: [] },
    outputSchema: agent.outputSchema,
    createdBy: "test",
    releaseNotes: "",
    createdAt: 1,
  };
  agent.agentProfileId = version.agentProfileId;
  agent.agentVersionId = version.id;
  return {
    version,
    workflow: {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "stage-e-release-agent",
      name: "Stage E agent",
      summary: "",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      nodes: [node("start", "start", { inputs: [] }), node("agent", "agent", agent), node("end", "end", { outputs: [] })],
      edges: [
        { id: "start-agent", source: { nodeId: "start", portId: "out" }, target: { nodeId: "agent", portId: "in" } },
        { id: "agent-end", source: { nodeId: "agent", portId: "result" }, target: { nodeId: "end", portId: "in" } },
      ],
    },
  };
}

function releaseAgentRuntime(): AgentRuntimePort {
  return {
    capabilities: async () => ({
      generate: true,
      stream: true,
      eventReplay: true,
      runQuery: true,
      cancel: true,
      toolEvents: true,
      usage: true,
      sessionMemory: true,
    }),
    generate: async () => { throw new Error("generate is not used by the Workflow Agent node"); },
    stream: async function* (command) {
      const result = {
        id: command.runId ?? "stage-e-agent-child",
        status: "succeeded" as const,
        createdAt: Date.now(),
        finishedAt: Date.now(),
        sessionId: command.sessionId,
        resourceId: command.resourceId,
        threadId: command.threadId,
        binding: { backend: "mastra" as const, adapterVersion: "release-test" },
        text: "advanced",
        toolExecutions: [],
      };
      yield { id: 1, runId: result.id, at: Date.now(), type: "text.delta" as const, delta: "advanced" };
      yield { id: 2, runId: result.id, at: Date.now(), type: "run.final" as const, result };
    },
    getRun: async () => null,
    cancel: async ({ runId }) => ({
      id: runId,
      status: "cancelled",
      createdAt: Date.now(),
      finishedAt: Date.now(),
      sessionId: "cancelled",
      resourceId: "cancelled",
      threadId: "cancelled",
      binding: { backend: "mastra", adapterVersion: "release-test" },
    }),
  };
}

function releaseWorkflow(): WorkflowDraft {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "mastra-only-release-window",
    name: "Mastra-only release window",
    summary: "P0 sequential workflow baseline",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      node("start", "start", { inputs: [{ id: "name", name: "名称", dataType: "string", required: true }] }),
      node("template", "template", {
        template: "hello {{name}}",
        variables: { name: { kind: "variable", ref: { scope: "workflow-input", inputId: "name" } } },
      }),
      node("end", "end", {
        outputs: [{ id: "text", name: "文本", value: { scope: "node-output", nodeId: "template", portId: "text" } }],
      }),
    ],
    edges: [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "template", portId: "in" } },
      { id: "e2", source: { nodeId: "template", portId: "text" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
}

describe("Mastra-only release window", () => {
  it("连续三轮并发执行 10 个 P0 Workflow，保持成功率和事件游标稳定", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-only-release-"));
    mastra = new Mastra({
      storage: new InMemoryStore({ id: `mastra-only-release-${Date.now()}` }),
      logger: new ConsoleLogger({ name: "mastra-only-release", level: LogLevel.WARN }),
    });
    const executors = createBuiltinWorkflowExecutorRegistry();
    const runtime = new MastraWorkflowRuntimeAdapter({
      compiler: new MastraWorkflowCompilerAdapter({ mastra, executors }),
      root,
      persistenceEnabled: false,
    });
    const workflow = releaseWorkflow();
    const batchDurations: number[] = [];

    for (let batch = 0; batch < 3; batch += 1) {
      const startedAt = performance.now();
      const runs = await Promise.all(Array.from({ length: 10 }, (_, index) => runtime.start({
        runId: `release-${batch}-${index}`,
        workflow,
        mode: "draft",
        inputs: { name: `${batch}-${index}` },
      })));
      const deadline = Date.now() + 5_000;
      const completed = await Promise.all(runs.map(async (started) => {
        let current = await runtime.get(started.id);
        while (current && !isTerminalWorkflowRunStatus(current.status) && Date.now() <= deadline) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          current = await runtime.get(started.id);
        }
        return current;
      }));
      batchDurations.push(performance.now() - startedAt);
      expect(completed).toHaveLength(10);
      expect(completed.every((run) => run?.status === "succeeded")).toBe(true);

      await Promise.all(runs.map(async (run) => {
        const events = [];
        for await (const event of runtime.events({ runId: run.id, sinceId: 0 })) events.push(event);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((event, index) => index === 0 || event.id > events[index - 1]!.id)).toBe(true);
        expect(events.at(-1)).toMatchObject({ type: "run.status", status: "succeeded" });
      }));
    }

    const maxDurationMs = Math.max(...batchDurations);
    console.log(`MASTRA_ONLY_RELEASE_WINDOW runs=30 max_batch_ms=${maxDurationMs.toFixed(1)}`);
    expect(maxDurationMs).toBeLessThan(5_000);
  });

  it("连续三轮并发执行 10 个阶段 E Workflow，并保持查询、SSE 和重连游标稳定", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-stage-e-release-"));
    mastra = new Mastra({
      storage: new InMemoryStore({ id: `mastra-stage-e-release-${Date.now()}` }),
      logger: new ConsoleLogger({ name: "mastra-stage-e-release", level: LogLevel.WARN }),
    });
    const agentRuntime = releaseAgentRuntime();
    const agent = agentFixture();
    const subworkflow = subworkflowFixture();
    const executors = createBuiltinWorkflowExecutorRegistry().register(new MastraWorkflowAgentNodeExecutor({
      runtime: agentRuntime,
      resolveVersion: (agentProfileId, agentVersionId) => (
        agent.version.agentProfileId === agentProfileId && agent.version.id === agentVersionId ? agent.version : undefined
      ),
    }));
    const runtime = new MastraWorkflowRuntimeAdapter({
      compiler: new MastraWorkflowCompilerAdapter({ mastra, executors }),
      root,
      persistenceEnabled: false,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    const commands: StartWorkflowRunCommand[] = [
      { workflow: parallelWorkflow(), mode: "draft" },
      { workflow: parallelWorkflow(), mode: "draft" },
      { workflow: iterationWorkflow(), mode: "draft" },
      { workflow: iterationWorkflow(), mode: "draft" },
      { workflow: loopWorkflow(), mode: "draft" },
      { workflow: loopWorkflow(), mode: "draft" },
      { workflow: subworkflow.parent, workflowDependencies: [subworkflow.child], mode: "draft" },
      { workflow: subworkflow.parent, workflowDependencies: [subworkflow.child], mode: "draft" },
      { workflow: agent.workflow, agentDependencies: [agent.version], requestContext: { ownerId: "release-owner" }, mode: "draft" },
      { workflow: agent.workflow, agentDependencies: [agent.version], requestContext: { ownerId: "release-owner" }, mode: "draft" },
    ];
    const batchDurations: number[] = [];
    let totalEvents = 0;

    for (let batch = 0; batch < 3; batch += 1) {
      const startedAt = performance.now();
      const runs = await Promise.all(commands.map((command, index) => runtime.start({
        ...command,
        runId: `stage-e-release-${batch}-${index}`,
      })));
      const deadline = Date.now() + 10_000;
      const completed = await Promise.all(runs.map(async (started) => {
        let current = await runtime.get(started.id);
        while (current && !isTerminalWorkflowRunStatus(current.status) && Date.now() <= deadline) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          current = await runtime.get(started.id);
        }
        return current;
      }));
      batchDurations.push(performance.now() - startedAt);
      expect(completed).toHaveLength(10);
      expect(completed.every((run) => run?.status === "succeeded")).toBe(true);
      expect(completed.some((run) => Object.keys(run?.nodeInstances ?? {}).length > 0)).toBe(true);
      expect(completed.some((run) => Object.keys(run?.childRuns ?? {}).length > 0)).toBe(true);

      await Promise.all(runs.map(async (run, index) => {
        const events = [];
        for await (const event of runtime.events({ runId: run.id, sinceId: 0 })) {
          events.push(event);
          if (index === 0) await new Promise((resolve) => setTimeout(resolve, 1));
        }
        totalEvents += events.length;
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((event, eventIndex) => eventIndex === 0 || event.id > events[eventIndex - 1]!.id)).toBe(true);
        expect(events.at(-1)).toMatchObject({ type: "run.status", status: "succeeded" });
        const cursor = events[Math.floor(events.length / 2)]!.id;
        const replay = [];
        for await (const event of runtime.events({ runId: run.id, sinceId: cursor })) replay.push(event);
        expect(replay.every((event) => event.id > cursor)).toBe(true);
      }));
    }

    const maxDurationMs = Math.max(...batchDurations);
    console.log(`MASTRA_STAGE_E_RELEASE_WINDOW runs=30 events=${totalEvents} max_batch_ms=${maxDurationMs.toFixed(1)}`);
    expect(maxDurationMs).toBeLessThan(10_000);
  });
});
