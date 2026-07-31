import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  WORKFLOW_SCHEMA_VERSION,
  type WorkflowStageECapabilityRegistry,
  builtinNodeRegistry,
  type AgentVersion,
  type TemplateNodeConfig,
  type WorkflowDraft,
  type WorkflowVersion,
} from "@orbit/workflow-core";
import type { AgentRuntimePort, StreamAgentCommand } from "@orbit/runtime-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { ConsoleLogger, LogLevel } from "@mastra/core/logger";
import { defineWorkflowRuntimePortContract } from "../../../harness/runtime-ports/workflow-contract.js";
import { getOrCreateMastraRuntime, shutdownMastraRuntime } from "../../../../src/mastra/instance/factory.js";
import { MastraWorkflowRuntimeAdapter } from "../../../../src/mastra/adapters/workflow-runtime-adapter.js";
import { MastraRunMappingRepository } from "../../../../src/mastra/storage/run-mapping-repository.js";
import { OrbitRuntimeEventJournal } from "../../../../src/mastra/storage/event-journal.js";
import { MastraWorkflowRunRepository } from "../../../../src/mastra/storage/workflow-run-repository.js";
import { MastraWorkflowCompilerAdapter } from "../../../../src/mastra/workflows/compiler-adapter.js";
import { WorkflowExecutorRegistry } from "../../../../src/workflows/executor-registry.js";
import { createBasicWorkflowExecutors } from "../../../../src/workflows/executors/basic.js";
import { MastraWorkflowAgentNodeExecutor } from "../../../../src/mastra/workflows/agent-node-executor.js";
import { HumanApprovalWorkflowExecutor } from "../../../../src/workflows/executors/human-approval.js";

const roots: Array<{ root: string; persistenceEnabled: boolean }> = [];
const inMemoryMastras: Mastra[] = [];
const ENABLED_STAGE_E_CAPABILITIES = {
  parallelMerge: true,
  iteration: true,
  boundedLoop: true,
  nestedWorkflow: true,
  agentNode: true,
  humanApproval: true,
  restartResume: true,
} satisfies WorkflowStageECapabilityRegistry;

afterEach(async () => {
  await Promise.all(inMemoryMastras.splice(0).map((mastra) => mastra.shutdown()));
  await Promise.all(roots.splice(0).map(async ({ root, persistenceEnabled }) => {
    await shutdownMastraRuntime({ root, persistenceEnabled });
    await rm(root, { recursive: true, force: true });
  }));
});

function node<T extends "start" | "template" | "variable" | "end" | "iteration" | "parallel" | "merge" | "loop" | "subworkflow" | "agent" | "human-approval">(type: T, id: string, config?: unknown) {
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

function agentWorkflowFixture(): { workflow: WorkflowDraft; version: AgentVersion } {
  const definition = builtinNodeRegistry.get("agent")!;
  const config = definition.createDefaultConfig();
  const version: AgentVersion = {
    id: "agent-v1",
    agentProfileId: "agent-profile-1",
    version: 1,
    contentHash: "agent-content-hash-1",
    name: "Workflow Agent",
    description: "",
    instructions: ["Execute the workflow task."],
    toolPolicy: { allowedToolIds: ["read-file"] },
    skillPolicy: { bindings: [] },
    outputSchema: config.outputSchema,
    createdBy: "test",
    releaseNotes: "",
    createdAt: 1,
  };
  config.agentProfileId = version.agentProfileId;
  config.agentVersionId = version.id;
  const workflow: WorkflowDraft = {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "workflow-agent-node",
    name: "Agent node",
    summary: "",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      node("start", "start", { inputs: [] }),
      node("agent", "agent", config),
      node("end", "end", {
        outputs: [{ id: "answer", name: "Answer", value: { scope: "node-output", nodeId: "agent", portId: "result" } }],
      }),
    ],
    edges: [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "agent", portId: "in" } },
      { id: "e2", source: { nodeId: "agent", portId: "result" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
  return { workflow, version };
}

function iterationWorkflow(
  items: unknown[],
  template: string,
  failurePolicy: "fail-fast" | "continue" | "collect-errors" = "fail-fast",
): WorkflowDraft {
  const definition = builtinNodeRegistry.get("iteration")!;
  const config = definition.createDefaultConfig();
  config.items = { kind: "literal", value: items };
  config.maxItems = items.length;
  config.maxConcurrency = 2;
  config.failurePolicy = failurePolicy;
  const body = node("template", "iteration-template", {
    template,
    variables: {
      item: { kind: "variable", ref: { scope: "loop", containerNodeId: "iteration", key: "item" } },
      index: { kind: "variable", ref: { scope: "loop", containerNodeId: "iteration", key: "index" } },
    },
  });
  config.body.nodes = [body];
  config.body.outputs = [{
    id: "text",
    name: "文本",
    dataType: "string",
    value: { scope: "node-output", nodeId: body.id, portId: "text" },
  }];
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: `workflow-iteration-${template}`,
    name: "Iteration",
    summary: "",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      node("start", "start", { inputs: [] }),
      node("iteration", "iteration", config),
      node("end", "end", { outputs: [] }),
    ],
    edges: [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "iteration", portId: "items" } },
      { id: "e2", source: { nodeId: "iteration", portId: "results" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
}

function parallelWorkflow(
  templates: string[],
  failurePolicy: "fail-fast" | "collect" = "fail-fast",
): WorkflowDraft {
  const parallelDefinition = builtinNodeRegistry.get("parallel")!;
  const parallelConfig = parallelDefinition.createDefaultConfig();
  parallelConfig.branches = templates.map((_template, index) => ({ id: `branch-${index}`, label: `Branch ${index}` }));
  parallelConfig.maxConcurrency = Math.min(2, templates.length);
  parallelConfig.failurePolicy = failurePolicy;
  const mergeDefinition = builtinNodeRegistry.get("merge")!;
  const mergeConfig = mergeDefinition.createDefaultConfig();
  mergeConfig.parallelNodeId = "parallel";
  const branchNodes = templates.map((template, index) => node("template", `parallel-template-${index}`, { template, variables: {} }));
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: `workflow-parallel-${templates.join("-")}`,
    name: "Parallel",
    summary: "",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      node("start", "start", { inputs: [] }),
      node("parallel", "parallel", parallelConfig),
      ...branchNodes,
      node("merge", "merge", mergeConfig),
      node("end", "end", { outputs: [] }),
    ],
    edges: [
      { id: "start-parallel", source: { nodeId: "start", portId: "out" }, target: { nodeId: "parallel", portId: "in" } },
      ...branchNodes.flatMap((branchNode, index) => [
        {
          id: `parallel-${index}`,
          source: { nodeId: "parallel", portId: `branch-${index}` },
          target: { nodeId: branchNode.id, portId: "in" },
        },
        {
          id: `merge-${index}`,
          source: { nodeId: branchNode.id, portId: "text" },
          target: { nodeId: "merge", portId: "branches" },
        },
      ]),
      { id: "merge-end", source: { nodeId: "merge", portId: "result" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
}

function loopWorkflow(template: string): WorkflowDraft {
  const definition = builtinNodeRegistry.get("loop")!;
  const config = definition.createDefaultConfig();
  config.condition = "state !== 'approved'";
  config.maxIterations = 3;
  config.initialVariables = [{
    id: "state",
    name: "State",
    dataType: "string",
    value: { kind: "literal", value: "pending" },
  }];
  const body = node("template", "loop-template", { template, variables: {} });
  config.body.nodes = [body];
  config.body.outputs = [{
    id: "state",
    name: "State",
    dataType: "string",
    value: { scope: "node-output", nodeId: body.id, portId: "text" },
  }];
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: `workflow-loop-${template}`,
    name: "Loop",
    summary: "",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      node("start", "start", { inputs: [] }),
      node("loop", "loop", config),
      node("end", "end", { outputs: [] }),
    ],
    edges: [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "loop", portId: "in" } },
      { id: "e2", source: { nodeId: "loop", portId: "output:state" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
}

function subworkflowFixture(template: string): { parent: WorkflowDraft; child: WorkflowVersion } {
  const childStart = node("start", "child-start", { inputs: [] });
  const childEffect = {
    ...node("template", "child-effect", { template: "__effect__", variables: {} }),
    execution: { idempotent: false },
  };
  const childAction = node("template", "child-action", { template, variables: {} });
  const childEnd = node("end", "child-end", {
    outputs: [{ id: "message", name: "消息", value: { scope: "node-output", nodeId: "child-action", portId: "text" } }],
  });
  const child: WorkflowVersion = {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "child-v1",
    workflowId: "child-workflow",
    version: 1,
    contentHash: "child-hash-v1",
    createdAt: 1,
    createdBy: "test",
    nodes: [childStart, childEffect, childAction, childEnd],
    edges: [
      { id: "ce1", source: { nodeId: "child-start", portId: "out" }, target: { nodeId: "child-effect", portId: "in" } },
      { id: "ce2", source: { nodeId: "child-effect", portId: "text" }, target: { nodeId: "child-action", portId: "in" } },
      { id: "ce3", source: { nodeId: "child-action", portId: "text" }, target: { nodeId: "child-end", portId: "in" } },
    ],
  };
  const definition = builtinNodeRegistry.get("subworkflow")!;
  const config = definition.createDefaultConfig();
  config.workflowId = child.workflowId;
  config.versionId = child.id;
  config.contentHash = child.contentHash;
  config.outputBindings = [{ outputId: "message", name: "消息", dataType: "string" }];
  const parent: WorkflowDraft = {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: `workflow-subworkflow-${template}`,
    name: "Subworkflow",
    summary: "",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      node("start", "start", { inputs: [] }),
      node("subworkflow", "subworkflow", config),
      node("end", "end", {
        outputs: [{ id: "message", name: "消息", value: { scope: "node-output", nodeId: "subworkflow", portId: "output:message" } }],
      }),
    ],
    edges: [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "subworkflow", portId: "in" } },
      { id: "e2", source: { nodeId: "subworkflow", portId: "output:message" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
  return { parent, child };
}

function workflow(template: string): WorkflowDraft {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: `workflow-${template}`,
    name: template,
    summary: "",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      node("start", "start", { inputs: [] }),
      node("template", "template", { template, variables: {} }),
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

function humanApprovalWorkflow(options: {
  deadlineMs?: number;
  timeoutPolicy?: "reject" | "fail" | "error-route";
  decisionPort?: "approved" | "rejected";
} = {}): WorkflowDraft {
  const definition = builtinNodeRegistry.get("human-approval")!;
  const config = definition.createDefaultConfig();
  config.policyId = "policy-1";
  config.deadlineMs = options.deadlineMs ?? 5_000;
  config.timeoutPolicy = options.timeoutPolicy ?? "fail";
  config.decisionSchema = {
    type: "object",
    properties: { comment: { type: "string" } },
    required: ["comment"],
    additionalProperties: false,
  };
  const decisionPort = options.decisionPort ?? "approved";
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "workflow-human-approval",
    name: "Human Approval",
    summary: "",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      node("start", "start", { inputs: [] }),
      node("human-approval", "approval", config),
      node("end", "end", {
        outputs: [{ id: "decision", name: "Decision", value: { scope: "node-output", nodeId: "approval", portId: decisionPort } }],
      }),
    ],
    edges: [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "approval", portId: "in" } },
      { id: "e2", source: { nodeId: "approval", portId: decisionPort }, target: { nodeId: "end", portId: "in" } },
    ],
  };
}

function humanApprovalAfterEffectWorkflow(): WorkflowDraft {
  const source = humanApprovalWorkflow();
  const effect = {
    ...node("variable", "non-idempotent-effect", { assignments: [] }),
    execution: { idempotent: false },
  };
  return {
    ...source,
    id: "workflow-human-approval-after-effect",
    nodes: [source.nodes[0]!, effect, source.nodes[1]!, source.nodes[2]!],
    edges: [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: effect.id, portId: "in" } },
      { id: "e2", source: { nodeId: effect.id, portId: "result" }, target: { nodeId: "approval", portId: "in" } },
      { id: "e3", source: { nodeId: "approval", portId: "approved" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
}

function executorRegistry(onNodeExecute?: (nodeId: string) => void, raceGate?: Promise<void>) {
  const registry = new WorkflowExecutorRegistry();
  const defaults = createBasicWorkflowExecutors();
  for (const executor of defaults.filter((item) => item.identity.id !== "workflow.template")) {
    registry.register({
      identity: executor.identity,
      async execute(context) {
        onNodeExecute?.(context.node.id);
        return executor.execute(context);
      },
    });
  }
  const template = defaults.find((item) => item.identity.id === "workflow.template")!;
  registry.register({
    identity: template.identity,
    async execute(context) {
      onNodeExecute?.(context.node.id);
      const config = context.node.config as TemplateNodeConfig;
      if (config.template === "__slow__") {
        await new Promise<void>((_resolve, reject) => {
          if (context.signal.aborted) {
            reject(context.signal.reason ?? new Error("cancelled"));
            return;
          }
          context.signal.addEventListener("abort", () => reject(context.signal.reason ?? new Error("cancelled")), { once: true });
        });
      }
      if (config.template === "__crash__") throw new Error("workflow step crashed");
      if (config.template === "__race__") await raceGate;
      if (config.template === "__suspend__") {
        if (!context.resumeData) return { outputs: {}, suspend: { payload: { reason: "approval" }, reason: "approval" } };
        return { outputs: { text: String((context.resumeData as { value?: unknown }).value ?? "resumed") } };
      }
      return template.execute(context);
    },
  });
  return registry;
}

async function fixture(
  persistenceEnabled = false,
  onNodeExecute?: (nodeId: string) => void,
  raceGate?: Promise<void>,
) {
  const root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-adapter-"));
  let mastra: Mastra;
  if (persistenceEnabled) {
    roots.push({ root, persistenceEnabled });
    mastra = (await getOrCreateMastraRuntime({ root, persistenceEnabled })).mastra;
  } else {
    roots.push({ root, persistenceEnabled });
    mastra = new Mastra({
      storage: new InMemoryStore({ id: `workflow-test-${Date.now()}` }),
      logger: new ConsoleLogger({ name: "workflow-test", level: LogLevel.WARN }),
    });
    inMemoryMastras.push(mastra);
  }
  const registry = executorRegistry(onNodeExecute, raceGate);
  const compiler = new MastraWorkflowCompilerAdapter({ mastra, executors: registry });
  const port = new MastraWorkflowRuntimeAdapter({
    compiler,
    root,
    persistenceEnabled,
    stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
  });
  return {
    root,
    port,
    startCommand: { workflow: workflow("done"), mode: "draft" as const },
    waitingCommand: { workflow: workflow("__suspend__"), mode: "draft" as const },
    async seedRunningRun() {
      return (await port.start({ workflow: workflow("__slow__"), mode: "draft" })).id;
    },
    resumeCommand: (runId: string) => ({ runId, stepId: "template", resumeData: { value: "approved" } }),
  };
}

defineWorkflowRuntimePortContract("Mastra", fixture);

describe("mastra/adapters/workflow-runtime-adapter", () => {
  it("默认开放已验证阶段 E 能力，并在编译前拒绝 Parallel/Merge", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-capabilities-"));
    roots.push({ root, persistenceEnabled: false });
    const mastra = new Mastra({
      storage: new InMemoryStore({ id: `workflow-capabilities-${Date.now()}` }),
      logger: new ConsoleLogger({ name: "workflow-capabilities", level: LogLevel.WARN }),
    });
    inMemoryMastras.push(mastra);
    const port = new MastraWorkflowRuntimeAdapter({
      compiler: new MastraWorkflowCompilerAdapter({ mastra, executors: executorRegistry() }),
      root,
      persistenceEnabled: false,
    });

    await expect(port.capabilities()).resolves.toMatchObject({
      start: true,
      restartRecovery: true,
      stageE: {
        parallelMerge: false,
        iteration: true,
        boundedLoop: true,
        nestedWorkflow: true,
        agentNode: true,
        humanApproval: true,
        restartResume: true,
      },
    });
    const iteration = await port.start({
      workflow: iterationWorkflow(["item"], "{{item}}"),
      mode: "draft",
    });
    const iterationEvents = [];
    for await (const event of port.events({ runId: iteration.id })) iterationEvents.push(event);
    expect(iterationEvents.at(-1)).toMatchObject({ type: "run.status", status: "succeeded" });
    await expect(port.get(iteration.id)).resolves.toMatchObject({ status: "succeeded" });
    await expect(port.start({
      workflow: parallelWorkflow(["left", "right"]),
      mode: "draft",
    })).rejects.toMatchObject({
      code: "RUNTIME_CAPABILITY_UNSUPPORTED",
      message: expect.stringContaining("parallelMerge"),
    });
    await expect(port.start({
      workflow: workflow("done"),
      mode: "draft",
      requiredRuntimeCapabilities: ["futureCapability"],
    })).rejects.toMatchObject({
      code: "RUNTIME_CAPABILITY_UNSUPPORTED",
      message: expect.stringContaining("futureCapability"),
    });
  });

  it("Human Approval 只接受匹配同一 run suspended snapshot 的 interrupt 决定", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-approval-resume-"));
    roots.push({ root, persistenceEnabled: false });
    const mastra = new Mastra({
      storage: new InMemoryStore({ id: `workflow-approval-resume-${Date.now()}` }),
      logger: new ConsoleLogger({ name: "workflow-approval-resume", level: LogLevel.WARN }),
    });
    inMemoryMastras.push(mastra);
    const registry = executorRegistry().register(new HumanApprovalWorkflowExecutor());
    const runMappings = new MastraRunMappingRepository({ root, persistenceEnabled: false });
    const port = new MastraWorkflowRuntimeAdapter({
      compiler: new MastraWorkflowCompilerAdapter({ mastra, executors: registry }),
      root,
      persistenceEnabled: false,
      runMappings,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    const started = await port.start({
      workflow: humanApprovalWorkflow(),
      approvalPolicyIds: ["policy-1"],
      mode: "draft",
    });
    const deadline = Date.now() + 1_000;
    let waiting = await port.get(started.id);
    while (waiting?.status === "running" && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      waiting = await port.get(started.id);
    }
    expect(waiting?.status).toBe("waiting");
    const interruptId = waiting?.waiting?.waiting?.interruptId;
    expect(interruptId).toMatch(/^interrupt_/);
    expect(waiting?.waiting?.waiting).not.toHaveProperty("checkpoint");
    expect(waiting?.waiting?.waiting).not.toHaveProperty("resumeToken");
    const resumeData = { interruptId, approvalRequestId: interruptId, action: "approve", data: { comment: "ok" } };
    const interrupt = { interruptId: interruptId!, action: "approve" as const, idempotencyKey: "decision-1" };

    await expect(port.resume({
      runId: started.id,
      stepId: "approval",
      resumeData,
    })).rejects.toMatchObject({ code: "RUNTIME_OWNERSHIP_CONFLICT" });
    await expect(port.resume({
      runId: started.id,
      stepId: "approval",
      resumeData,
      interrupt: { ...interrupt, interruptId: "interrupt-forged" },
    })).rejects.toMatchObject({ code: "RUNTIME_OWNERSHIP_CONFLICT" });
    vi.spyOn(runMappings, "get").mockResolvedValueOnce({
      domain: "workflow",
      productRunId: started.id,
      mastraRunId: "different-native-run",
      adapterVersion: "test",
      createdAt: 1,
    });
    await expect(port.resume({
      runId: started.id,
      stepId: "approval",
      resumeData,
      interrupt,
    })).rejects.toMatchObject({ code: "RUNTIME_OWNERSHIP_CONFLICT" });
    await expect(port.get(started.id)).resolves.toMatchObject({ status: "waiting" });
    await expect(port.resume({
      runId: started.id,
      stepId: "approval",
      resumeData: { ...resumeData, data: {} },
      interrupt,
    })).rejects.toMatchObject({ code: "RUNTIME_INPUT_INVALID" });
    await expect(port.resume({
      runId: started.id,
      stepId: "approval",
      resumeData,
      interrupt,
    })).resolves.toMatchObject({ status: "succeeded" });
    await expect(port.resume({
      runId: started.id,
      stepId: "approval",
      resumeData,
      interrupt,
    })).resolves.toMatchObject({ status: "succeeded" });
    await expect(port.resume({
      runId: started.id,
      stepId: "approval",
      resumeData: { interruptId, action: "reject", data: { comment: "no" } },
      interrupt: { interruptId: interruptId!, action: "reject", idempotencyKey: "decision-1" },
    })).rejects.toMatchObject({ code: "RUNTIME_TERMINAL_CONFLICT" });
  });

  it("查询或 SSE 重连过期 waiting run 时按 Mastra snapshot 自动执行 timeout", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-approval-timeout-"));
    roots.push({ root, persistenceEnabled: false });
    const mastra = new Mastra({
      storage: new InMemoryStore({ id: `workflow-approval-timeout-${Date.now()}` }),
      logger: new ConsoleLogger({ name: "workflow-approval-timeout", level: LogLevel.WARN }),
    });
    inMemoryMastras.push(mastra);
    const port = new MastraWorkflowRuntimeAdapter({
      compiler: new MastraWorkflowCompilerAdapter({
        mastra,
        executors: executorRegistry().register(new HumanApprovalWorkflowExecutor()),
      }),
      root,
      persistenceEnabled: false,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    const started = await port.start({
      workflow: humanApprovalWorkflow({ deadlineMs: 35, timeoutPolicy: "fail" }),
      approvalPolicyIds: ["policy-1"],
      mode: "draft",
    });
    const waitingDeadline = Date.now() + 1_000;
    let waiting = await port.get(started.id);
    while (waiting?.status === "running" && Date.now() <= waitingDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      waiting = await port.get(started.id);
    }
    expect(waiting?.status).toBe("waiting");
    await new Promise((resolve) => setTimeout(resolve, 45));

    await expect(port.get(started.id)).resolves.toMatchObject({
      status: "failed",
      error: { code: "APPROVAL_TIMEOUT" },
    });
    const replayed = [];
    for await (const event of port.events({ runId: started.id, sinceId: 0 })) replayed.push(event);
    expect(replayed.at(-1)).toMatchObject({ type: "run.status", status: "failed" });
  });

  it("reject 决定恢复同一个 Mastra run 并进入 rejected 分支", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-approval-reject-"));
    roots.push({ root, persistenceEnabled: false });
    const mastra = new Mastra({
      storage: new InMemoryStore({ id: `workflow-approval-reject-${Date.now()}` }),
      logger: new ConsoleLogger({ name: "workflow-approval-reject", level: LogLevel.WARN }),
    });
    inMemoryMastras.push(mastra);
    const port = new MastraWorkflowRuntimeAdapter({
      compiler: new MastraWorkflowCompilerAdapter({
        mastra,
        executors: executorRegistry().register(new HumanApprovalWorkflowExecutor()),
      }),
      root,
      persistenceEnabled: false,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    const started = await port.start({
      workflow: humanApprovalWorkflow({ decisionPort: "rejected" }),
      approvalPolicyIds: ["policy-1"],
      mode: "draft",
    });
    const deadline = Date.now() + 1_000;
    let waiting = await port.get(started.id);
    while (waiting?.status === "running" && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      waiting = await port.get(started.id);
    }
    const interruptId = waiting?.waiting?.waiting?.interruptId;

    await expect(port.resume({
      runId: started.id,
      stepId: "approval",
      resumeData: { interruptId, approvalRequestId: interruptId, action: "reject", data: { comment: "拒绝发布" } },
      interrupt: { interruptId: interruptId!, action: "reject", idempotencyKey: "reject-decision" },
    })).resolves.toMatchObject({
      id: started.id,
      status: "succeeded",
      output: { decision: { interruptId, action: "reject", data: { comment: "拒绝发布" } } },
    });
  });

  it("waiting run 的 resume 与 cancel 竞态只产生一个稳定终态", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-approval-cancel-race-"));
    roots.push({ root, persistenceEnabled: false });
    const mastra = new Mastra({
      storage: new InMemoryStore({ id: `workflow-approval-cancel-race-${Date.now()}` }),
      logger: new ConsoleLogger({ name: "workflow-approval-cancel-race", level: LogLevel.WARN }),
    });
    inMemoryMastras.push(mastra);
    const port = new MastraWorkflowRuntimeAdapter({
      compiler: new MastraWorkflowCompilerAdapter({
        mastra,
        executors: executorRegistry().register(new HumanApprovalWorkflowExecutor()),
      }),
      root,
      persistenceEnabled: false,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    const started = await port.start({
      workflow: humanApprovalWorkflow(),
      approvalPolicyIds: ["policy-1"],
      mode: "draft",
    });
    const deadline = Date.now() + 1_000;
    let waiting = await port.get(started.id);
    while (waiting?.status === "running" && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      waiting = await port.get(started.id);
    }
    const interruptId = waiting?.waiting?.waiting?.interruptId;
    const settled = await Promise.allSettled([
      port.resume({
        runId: started.id,
        stepId: "approval",
        resumeData: { interruptId, approvalRequestId: interruptId, action: "approve", data: { comment: "ok" } },
        interrupt: { interruptId: interruptId!, action: "approve", idempotencyKey: "race-decision" },
      }),
      port.cancel({ runId: started.id }),
    ]);
    expect(settled.some((result) => result.status === "fulfilled")).toBe(true);
    const terminal = await port.get(started.id);
    expect(["succeeded", "cancelled"]).toContain(terminal?.status);
    const events = [];
    for await (const event of port.events({ runId: started.id })) events.push(event);
    const terminalStatuses = events.filter((event) => (
      event.type === "run.status" && ["succeeded", "failed", "cancelled"].includes(event.status)
    ));
    expect(new Set(terminalStatuses.map((event) => event.type === "run.status" ? event.status : "")).size).toBe(1);
  });

  it("terminal retention 到期后联动清理 run mapping、event journal 和 decision 技术状态", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-retention-cleanup-"));
    roots.push({ root, persistenceEnabled: false });
    const mastra = new Mastra({
      storage: new InMemoryStore({ id: `workflow-retention-cleanup-${Date.now()}` }),
      logger: new ConsoleLogger({ name: "workflow-retention-cleanup", level: LogLevel.WARN }),
    });
    inMemoryMastras.push(mastra);
    let now = 100;
    const runMappings = new MastraRunMappingRepository({ root, persistenceEnabled: false });
    const journal = new OrbitRuntimeEventJournal({ root, persistenceEnabled: false });
    const runs = new MastraWorkflowRunRepository({
      root,
      persistenceEnabled: false,
      now: () => now,
      terminalRetentionMs: 10,
      decisionTtlMs: 10,
    });
    const port = new MastraWorkflowRuntimeAdapter({
      compiler: new MastraWorkflowCompilerAdapter({ mastra, executors: executorRegistry() }),
      root,
      persistenceEnabled: false,
      runMappings,
      journal,
      runs,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    const started = await port.start({ workflow: workflow("done"), mode: "draft" });
    const events = [];
    for await (const event of port.events({ runId: started.id })) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: "run.status", status: "succeeded" });
    await expect(runMappings.get("workflow", started.id)).resolves.not.toBeNull();
    await expect(journal.listWorkflow(started.id)).resolves.not.toHaveLength(0);

    now = 111;
    await expect(port.get(started.id)).resolves.toBeNull();
    await expect(runMappings.get("workflow", started.id)).resolves.toBeNull();
    await expect(journal.listWorkflow(started.id)).resolves.toEqual([]);
  });

  it("Human Approval 跨进程恢复同一 native snapshot，且不重放已成功非幂等前置节点", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-approval-restart-"));
    roots.push({ root, persistenceEnabled: true });
    const executions: string[] = [];
    const firstRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
    const firstRegistry = executorRegistry((nodeId) => executions.push(nodeId))
      .register(new HumanApprovalWorkflowExecutor());
    const first = new MastraWorkflowRuntimeAdapter({
      compiler: new MastraWorkflowCompilerAdapter({ mastra: firstRuntime.mastra, executors: firstRegistry }),
      root,
      persistenceEnabled: true,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    const started = await first.start({
      workflow: humanApprovalAfterEffectWorkflow(),
      approvalPolicyIds: ["policy-1"],
      mode: "draft",
    });
    const deadline = Date.now() + 1_000;
    let waiting = await first.get(started.id);
    while (waiting?.status === "running" && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      waiting = await first.get(started.id);
    }
    expect(waiting?.status).toBe("waiting");
    const interruptId = waiting?.waiting?.waiting?.interruptId;
    expect(interruptId).toMatch(/^interrupt_/);
    await shutdownMastraRuntime({ root, persistenceEnabled: true });

    const restoredRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
    const restoredRegistry = executorRegistry((nodeId) => executions.push(nodeId))
      .register(new HumanApprovalWorkflowExecutor());
    const restored = new MastraWorkflowRuntimeAdapter({
      compiler: new MastraWorkflowCompilerAdapter({ mastra: restoredRuntime.mastra, executors: restoredRegistry }),
      root,
      persistenceEnabled: true,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    const resumed = await restored.resume({
      runId: started.id,
      stepId: "approval",
      resumeData: { interruptId, approvalRequestId: interruptId, action: "approve", data: { comment: "restart" } },
      interrupt: { interruptId: interruptId!, action: "approve", idempotencyKey: "restart-decision" },
    });

    expect(resumed.status).toBe("succeeded");
    expect(executions.filter((nodeId) => nodeId === "start")).toHaveLength(1);
    expect(executions.filter((nodeId) => nodeId === "non-idempotent-effect")).toHaveLength(1);
    expect(executions.filter((nodeId) => nodeId === "end")).toHaveLength(1);
  });

  it("AgentRuntimePort 子事件经 outputWriter 映射为带 childRunId 的 Workflow 产品事件", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-agent-events-"));
    roots.push({ root, persistenceEnabled: false });
    const mastra = new Mastra({
      storage: new InMemoryStore({ id: `workflow-agent-events-${Date.now()}` }),
      logger: new ConsoleLogger({ name: "workflow-agent-events", level: LogLevel.WARN }),
    });
    inMemoryMastras.push(mastra);
    const source = agentWorkflowFixture();
    const agentRuntime: AgentRuntimePort = {
      capabilities: vi.fn(),
      generate: vi.fn(),
      getRun: vi.fn(),
      cancel: vi.fn(),
      stream: vi.fn(async function* (command: StreamAgentCommand) {
        const runId = command.runId!;
        yield { id: 1, runId, at: 1, type: "text.delta", delta: "done" } as const;
        yield { id: 2, runId, at: 2, type: "tool.call", callId: "call-1", toolId: "read-file", input: { secret: "must-not-leak" } } as const;
        yield {
          id: 3,
          runId,
          at: 3,
          type: "tool.result",
          result: { callId: "call-1", toolId: "read-file", status: "succeeded", output: { secret: "must-not-leak" } },
        } as const;
        yield { id: 4, runId, at: 4, type: "usage", usage: { inputTokens: 2, outputTokens: 1 } } as const;
        yield {
          id: 5,
          runId,
          at: 5,
          type: "run.final",
          result: {
            id: runId,
            status: "succeeded",
            createdAt: 1,
            sessionId: command.sessionId,
            resourceId: command.resourceId,
            threadId: command.threadId,
            binding: { backend: "mastra", adapterVersion: "test", nativeRunId: "native-agent" },
            text: "done",
            toolExecutions: [],
          },
        } as const;
      }),
    };
    const registry = executorRegistry().register(new MastraWorkflowAgentNodeExecutor({
      runtime: agentRuntime,
      resolveVersion: (profileId, versionId, context) => {
        const versions = context.requestContext?.__workflowAgentVersions as AgentVersion[] | undefined;
        return versions?.find((version) => version.agentProfileId === profileId && version.id === versionId);
      },
    }));
    const port = new MastraWorkflowRuntimeAdapter({
      compiler: new MastraWorkflowCompilerAdapter({ mastra, executors: registry }),
      root,
      persistenceEnabled: false,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });

    await expect(port.start({
      workflow: source.workflow,
      mode: "draft",
      requestContext: { ownerId: "owner-1" },
    })).rejects.toThrow("agent.version-resolver-missing");
    expect(agentRuntime.stream).not.toHaveBeenCalled();

    const started = await port.start({
      workflow: source.workflow,
      agentDependencies: [source.version],
      mode: "draft",
      requestContext: { ownerId: "owner-1" },
    });
    const events = [];
    for await (const event of port.events({ runId: started.id })) events.push(event);
    const agentEvents = events.filter((event) => "nodeId" in event && event.nodeId === "agent");

    expect(agentEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "node.output",
        delta: "done",
        output: { delta: "done" },
        childRunId: expect.stringMatching(/^agent-child-/),
        executionPath: ["agent"],
      }),
      expect.objectContaining({
        type: "node.log",
        level: "info",
        message: "Agent Tool read-file started (call-1)",
        childRunId: expect.stringMatching(/^agent-child-/),
      }),
      expect.objectContaining({
        type: "node.log",
        level: "debug",
        message: "Agent usage {\"inputTokens\":2,\"outputTokens\":1}",
        childRunId: expect.stringMatching(/^agent-child-/),
      }),
      expect.objectContaining({
        type: "node.status",
        status: "succeeded",
        childRunId: expect.stringMatching(/^agent-child-/),
      }),
    ]));
    expect(JSON.stringify(agentEvents)).not.toContain("must-not-leak");
  });

  it("进程重启恢复后不重放已成功的非幂等 Agent child run", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-agent-restart-"));
    roots.push({ root, persistenceEnabled: true });
    const source = agentWorkflowFixture();
    const suspendNode = node("template", "approval-gate", { template: "__suspend__", variables: {} });
    const endNode = node("end", "end", {
      outputs: [{ id: "answer", name: "Answer", value: { scope: "node-output", nodeId: "approval-gate", portId: "text" } }],
    });
    const workflow: WorkflowDraft = {
      ...source.workflow,
      id: "workflow-agent-restart",
      nodes: [source.workflow.nodes[0]!, source.workflow.nodes[1]!, suspendNode, endNode],
      edges: [
        { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "agent", portId: "in" } },
        { id: "e2", source: { nodeId: "agent", portId: "result" }, target: { nodeId: "approval-gate", portId: "in" } },
        { id: "e3", source: { nodeId: "approval-gate", portId: "text" }, target: { nodeId: "end", portId: "in" } },
      ],
    };
    const stream = vi.fn(async function* (command: StreamAgentCommand) {
      const runId = command.runId!;
      yield {
        id: 1,
        runId,
        at: 1,
        type: "run.final",
        result: {
          id: runId,
          status: "succeeded",
          createdAt: 1,
          sessionId: command.sessionId,
          resourceId: command.resourceId,
          threadId: command.threadId,
          binding: { backend: "mastra", adapterVersion: "test", nativeRunId: "native-agent" },
          text: "done",
          toolExecutions: [],
        },
      } as const;
    });
    const agentRuntime: AgentRuntimePort = {
      capabilities: vi.fn(),
      generate: vi.fn(),
      getRun: vi.fn(),
      cancel: vi.fn(),
      stream,
    };
    const registry = () => executorRegistry().register(new MastraWorkflowAgentNodeExecutor({
      runtime: agentRuntime,
      resolveVersion: (profileId, versionId, context) => {
        const versions = context.requestContext?.__workflowAgentVersions as AgentVersion[] | undefined;
        return versions?.find((version) => version.agentProfileId === profileId && version.id === versionId);
      },
    }));
    const initialRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
    const port = new MastraWorkflowRuntimeAdapter({
      compiler: new MastraWorkflowCompilerAdapter({ mastra: initialRuntime.mastra, executors: registry() }),
      root,
      persistenceEnabled: true,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    const started = await port.start({
      workflow,
      agentDependencies: [source.version],
      mode: "draft",
      requestContext: { ownerId: "owner-1" },
    });
    const deadline = Date.now() + 1_000;
    let waiting = await port.get(started.id);
    while (waiting?.status === "running" && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      waiting = await port.get(started.id);
    }
    expect(waiting?.status).toBe("waiting");
    expect(stream).toHaveBeenCalledTimes(1);
    await shutdownMastraRuntime({ root, persistenceEnabled: true });

    const restoredRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
    const restored = new MastraWorkflowRuntimeAdapter({
      compiler: new MastraWorkflowCompilerAdapter({ mastra: restoredRuntime.mastra, executors: registry() }),
      root,
      persistenceEnabled: true,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    await expect(restored.resume({
      runId: started.id,
      stepId: "approval-gate",
      resumeData: { value: "approved" },
    })).resolves.toMatchObject({ status: "succeeded", output: { answer: "approved" } });
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it("父取消自然传播到活动 Subworkflow，且不执行父后继节点", async () => {
    const executed: string[] = [];
    const { port } = await fixture(false, (nodeId) => executed.push(nodeId));
    const source = subworkflowFixture("__slow__");
    const started = await port.start({
      workflow: source.parent,
      workflowDependencies: [source.child],
      mode: "draft",
    });
    const deadline = Date.now() + 1_000;
    while (!executed.includes("child-action") && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const expectedCancellationLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(port.cancel({ runId: started.id })).resolves.toMatchObject({
        status: "cancelled",
        nodeRuns: {
          subworkflow: { status: "cancelled" },
          end: { status: "cancelled" },
        },
      });
      expect(executed).toContain("child-action");
      expect(executed).not.toContain("end");
    } finally {
      expectedCancellationLog.mockRestore();
    }
  });

  it("Subworkflow 从固定 snapshot 跨进程恢复，且不重放已成功非幂等 child step", async () => {
    const executed: string[] = [];
    const { port, root } = await fixture(true, (nodeId) => executed.push(nodeId));
    const source = subworkflowFixture("__suspend__");
    const started = await port.start({
      workflow: source.parent,
      workflowDependencies: [source.child],
      mode: "draft",
    });
    const deadline = Date.now() + 1_000;
    let waiting = await port.get(started.id);
    while (waiting?.status === "running" && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      waiting = await port.get(started.id);
    }
    expect(waiting?.status).toBe("waiting");
    const eventsBeforeRestart = [];
    const iterator = port.events({ runId: started.id })[Symbol.asyncIterator]();
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      eventsBeforeRestart.push(next.value);
      if (next.value.type === "run.status" && next.value.status === "waiting") break;
    }
    await iterator.return?.();
    const childRunId = eventsBeforeRestart.find((event) => (
      event.type === "node.status" && event.nodeId === "child-action" && event.childRunId
    ))?.childRunId;
    expect(childRunId).toMatch(/^workflow-child-/);
    await shutdownMastraRuntime({ root, persistenceEnabled: true });

    const restoredRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
    const restoredCompiler = new MastraWorkflowCompilerAdapter({
      mastra: restoredRuntime.mastra,
      executors: executorRegistry((nodeId) => executed.push(nodeId)),
    });
    const restored = new MastraWorkflowRuntimeAdapter({
      compiler: restoredCompiler,
      root,
      persistenceEnabled: true,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    const resumed = await restored.resume({
      runId: started.id,
      stepId: "subworkflow",
      resumeData: { value: "approved" },
    });

    expect(resumed).toMatchObject({
      status: "succeeded",
      output: { message: "approved" },
      nodeRuns: { subworkflow: { status: "succeeded", output: { "output:message": "approved" } } },
    });
    expect(executed.filter((nodeId) => nodeId === "child-effect")).toHaveLength(1);
    expect(executed.filter((nodeId) => nodeId === "child-action")).toHaveLength(2);
    expect(executed.filter((nodeId) => nodeId === "end")).toHaveLength(1);
  });

  it("Loop 取消后不启动下一次 iteration", async () => {
    const executed: string[] = [];
    const { port } = await fixture(false, (nodeId) => executed.push(nodeId));
    const started = await port.start({ workflow: loopWorkflow("__slow__"), mode: "draft" });
    const deadline = Date.now() + 1_000;
    while (!executed.includes("loop-template") && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const expectedCancellationLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const cancelled = await port.cancel({ runId: started.id });
      expect(cancelled).toMatchObject({ status: "cancelled", nodeRuns: { loop: { status: "cancelled" } } });
      expect(executed.filter((nodeId) => nodeId === "loop-template")).toHaveLength(1);
    } finally {
      expectedCancellationLog.mockRestore();
    }
  });

  it("Loop 从持久 snapshot 恢复时不重复已完成 iteration", async () => {
    const executed: string[] = [];
    const { port, root } = await fixture(true, (nodeId) => executed.push(nodeId));
    const started = await port.start({ workflow: loopWorkflow("__suspend__"), mode: "draft" });
    const deadline = Date.now() + 1_000;
    let waiting = await port.get(started.id);
    while (waiting?.status === "running" && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      waiting = await port.get(started.id);
    }
    expect(waiting?.status).toBe("waiting");
    await shutdownMastraRuntime({ root, persistenceEnabled: true });

    const restoredRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
    const restoredCompiler = new MastraWorkflowCompilerAdapter({
      mastra: restoredRuntime.mastra,
      executors: executorRegistry((nodeId) => executed.push(nodeId)),
    });
    const restored = new MastraWorkflowRuntimeAdapter({
      compiler: restoredCompiler,
      root,
      persistenceEnabled: true,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    const resumed = await restored.resume({
      runId: started.id,
      stepId: "loop",
      resumeData: { value: "approved" },
    });

    expect(resumed.status, JSON.stringify(resumed)).toBe("succeeded");
    expect(resumed).toMatchObject({
      status: "succeeded",
      nodeRuns: { loop: { status: "succeeded", output: { "output:state": "approved" } } },
    });
    expect(executed.filter((nodeId) => nodeId === "loop-template")).toHaveLength(2);
    expect(executed.filter((nodeId) => nodeId === "end")).toHaveLength(1);
  });

  it("通过 WorkflowRuntimePort 运行 Parallel/Merge，并输出稳定分支实例事件", async () => {
    const { port } = await fixture();
    const started = await port.start({ workflow: parallelWorkflow(["left", "right"]), mode: "draft" });
    const events = [];
    for await (const event of port.events({ runId: started.id })) events.push(event);

    const instanceEvents = events.filter((event) => (
      event.type === "node.status" && event.nodeId === "parallel" && event.instanceId !== undefined
    ));
    expect(new Set(instanceEvents.map((event) => event.instanceId)).size).toBe(2);
    await expect(port.get(started.id)).resolves.toMatchObject({
      status: "succeeded",
      nodeRuns: {
        parallel: { status: "succeeded" },
        merge: {
          status: "succeeded",
          output: {
            result: [
              { branchId: "branch-0", status: "succeeded", output: { text: "left" } },
              { branchId: "branch-1", status: "succeeded", output: { text: "right" } },
            ],
          },
        },
      },
    });
  });

  it("Parallel fail-fast 错误通过 Runtime Port 收敛 failed", async () => {
    const { port } = await fixture();
    const expectedFailureLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const started = await port.start({ workflow: parallelWorkflow(["__crash__", "right"]), mode: "draft" });
      const events = [];
      for await (const event of port.events({ runId: started.id })) events.push(event);

      expect(events.at(-1)).toMatchObject({ type: "run.status", status: "failed" });
      await expect(port.get(started.id)).resolves.toMatchObject({
        status: "failed",
        nodeRuns: { parallel: { status: "failed" }, merge: { status: "skipped" } },
      });
    } finally {
      expectedFailureLog.mockRestore();
    }
  });

  it("Parallel collect 保留失败分支并继续执行 Merge", async () => {
    const { port } = await fixture();
    const expectedFailureLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const started = await port.start({ workflow: parallelWorkflow(["__crash__", "right"], "collect"), mode: "draft" });
      const events = [];
      for await (const event of port.events({ runId: started.id })) events.push(event);

      expect(events.some((event) => (
        event.type === "node.status" && event.nodeId === "parallel" && event.instanceId !== undefined && event.status === "failed"
      ))).toBe(true);
      await expect(port.get(started.id)).resolves.toMatchObject({
        status: "succeeded",
        nodeRuns: {
          merge: {
            output: {
              result: [
                { branchId: "branch-0", status: "failed", error: { message: "workflow step crashed" } },
                { branchId: "branch-1", status: "succeeded", output: { text: "right" } },
              ],
            },
          },
        },
      });
    } finally {
      expectedFailureLog.mockRestore();
    }
  });

  it("Runtime Port 取消 Parallel 时活动分支终止且等待分支和 Merge 不启动", async () => {
    const executed: string[] = [];
    const { port } = await fixture(false, (nodeId) => executed.push(nodeId));
    const started = await port.start({ workflow: parallelWorkflow(["__slow__", "__slow__", "__slow__", "__slow__"]), mode: "draft" });
    const deadline = Date.now() + 1_000;
    while (executed.filter((nodeId) => nodeId.startsWith("parallel-template-")).length < 2 && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const expectedCancellationLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const cancelled = await port.cancel({ runId: started.id });
      expect(executed.filter((nodeId) => nodeId.startsWith("parallel-template-"))).toHaveLength(2);
      expect(cancelled).toMatchObject({
        status: "cancelled",
        nodeRuns: { parallel: { status: "cancelled" }, merge: { status: "cancelled" } },
      });
    } finally {
      expectedCancellationLog.mockRestore();
    }
  });

  it("通过 WorkflowRuntimePort 运行 Iteration，并输出稳定实例事件与连续游标", async () => {
    const { port } = await fixture();
    const started = await port.start({ workflow: iterationWorkflow(["a", "b"], "{{item}}-{{index}}"), mode: "draft" });
    const events = [];
    for await (const event of port.events({ runId: started.id })) events.push(event);

    expect(events.map((event) => event.id)).toEqual(events.map((_event, index) => index + 1));
    const instanceEvents = events.filter((event) => (
      event.type === "node.status" && event.nodeId === "iteration" && event.instanceId !== undefined
    ));
    expect(instanceEvents.map((event) => event.iterationIndex).sort()).toEqual([0, 1]);
    await expect(port.get(started.id)).resolves.toMatchObject({
      status: "succeeded",
      nodeRuns: { iteration: { status: "succeeded", output: { results: [{ text: "a-0" }, { text: "b-1" }] } } },
    });
  });

  it("Iteration body 错误通过 Runtime Port 收敛 failed", async () => {
    const { port } = await fixture();
    const expectedFailureLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const started = await port.start({ workflow: iterationWorkflow(["a", "b"], "__crash__"), mode: "draft" });
      const events = [];
      for await (const event of port.events({ runId: started.id })) events.push(event);

      expect(events.at(-1)).toMatchObject({ type: "run.status", status: "failed" });
      await expect(port.get(started.id)).resolves.toMatchObject({
        status: "failed",
        nodeRuns: { iteration: { status: "failed" } },
      });
    } finally {
      expectedFailureLog.mockRestore();
    }
  });

  it("Iteration continue 与 collect-errors 保留稳定 index 槽位", async () => {
    const { port } = await fixture();
    const expectedFailureLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const continued = await port.start({
        workflow: iterationWorkflow(["a", "b"], "__crash__", "continue"),
        mode: "draft",
      });
      for await (const event of port.events({ runId: continued.id })) {
        void event;
        // 等待终态。
      }
      await expect(port.get(continued.id)).resolves.toMatchObject({
        status: "succeeded",
        nodeRuns: { iteration: { output: { results: [null, null] } } },
      });

      const collected = await port.start({
        workflow: iterationWorkflow(["a", "b"], "__crash__", "collect-errors"),
        mode: "draft",
      });
      for await (const event of port.events({ runId: collected.id })) {
        void event;
        // 等待终态。
      }
      await expect(port.get(collected.id)).resolves.toMatchObject({
        status: "succeeded",
        nodeRuns: {
          iteration: {
            output: {
              results: [
                { index: 0, status: "failed", error: { message: "workflow step crashed" } },
                { index: 1, status: "failed", error: { message: "workflow step crashed" } },
              ],
            },
          },
        },
      });
    } finally {
      expectedFailureLog.mockRestore();
    }
  });

  it("Runtime Port 取消 Iteration 时活动项终止且等待项不启动", async () => {
    const executed: string[] = [];
    const { port } = await fixture(false, (nodeId) => executed.push(nodeId));
    const started = await port.start({ workflow: iterationWorkflow([0, 1, 2, 3], "__slow__"), mode: "draft" });
    const deadline = Date.now() + 1_000;
    while (executed.filter((nodeId) => nodeId === "iteration-template").length < 2 && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const expectedCancellationLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const cancelled = await port.cancel({ runId: started.id });
      expect(executed.filter((nodeId) => nodeId === "iteration-template")).toHaveLength(2);
      expect(cancelled).toMatchObject({ status: "cancelled", nodeRuns: { iteration: { status: "cancelled" } } });
    } finally {
      expectedCancellationLog.mockRestore();
    }
  });

  it("production 只接受不可变版本，node-test 只执行目标节点", async () => {
    const { port } = await fixture();
    await expect(port.start({ workflow: workflow("draft"), mode: "production" })).rejects.toMatchObject({
      code: "RUNTIME_CAPABILITY_UNSUPPORTED",
    });
    const source = workflow("production");
    const version: WorkflowVersion = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "version-1",
      workflowId: source.id,
      version: 1,
      contentHash: "content-hash-1",
      createdAt: 2,
      createdBy: "test",
      nodes: source.nodes,
      edges: source.edges,
    };
    const production = await port.start({ workflow: version, mode: "production" });
    expect(production).toMatchObject({
      workflowId: source.id,
      versionId: "version-1",
      contentHash: "content-hash-1",
      mode: "production",
    });

    const started = await port.start({
      workflow: workflow("node-test"),
      mode: "node-test",
      targetNodeId: "template",
      nodeInputs: {},
    });
    const deadline = Date.now() + 1_000;
    let completed = await port.get(started.id);
    while (completed?.status === "running" && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed = await port.get(started.id);
    }
    expect(completed).toMatchObject({
      status: "succeeded",
      nodeRuns: {
        start: { status: "skipped" },
        template: { status: "succeeded" },
        end: { status: "skipped" },
      },
    });
  });

  it("进程级 Adapter 重建后仍可查询持久化产品快照", async () => {
    const { port, root } = await fixture(true);
    const started = await port.start({ workflow: workflow("persisted"), mode: "draft" });
    const deadline = Date.now() + 1_000;
    let snapshot = await port.get(started.id);
    while (snapshot?.status === "running" && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      snapshot = await port.get(started.id);
    }
    expect(snapshot?.status).toBe("succeeded");
    await shutdownMastraRuntime({ root, persistenceEnabled: true });

    const restoredRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
    const restoredCompiler = new MastraWorkflowCompilerAdapter({
      mastra: restoredRuntime.mastra,
      executors: executorRegistry(),
    });
    const restored = new MastraWorkflowRuntimeAdapter({
      compiler: restoredCompiler,
      root,
      persistenceEnabled: true,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    await expect(restored.get(started.id)).resolves.toEqual(snapshot);
  });

  it("慢消费者和订阅断开不取消或改变 Workflow backend", async () => {
    const { port } = await fixture();
    const started = await port.start({ workflow: workflow("slow-consumer"), mode: "draft" });
    const iterator = port.events({ runId: started.id })[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { type: "run.status", status: "running" } });
    const deadline = Date.now() + 1_000;
    let snapshot = await port.get(started.id);
    while (snapshot?.status === "running" && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      snapshot = await port.get(started.id);
    }
    expect(snapshot?.status).toBe("succeeded");
    await iterator.return?.();
    await expect(port.get(started.id)).resolves.toMatchObject({ status: "succeeded" });

    const disconnectRun = await port.start({ workflow: workflow("__slow__"), mode: "draft" });
    const disconnectIterator = port.events({ runId: disconnectRun.id })[Symbol.asyncIterator]();
    await disconnectIterator.next();
    await disconnectIterator.return?.();
    await expect(port.get(disconnectRun.id)).resolves.toMatchObject({ status: "running" });
    await expect(port.cancel({ runId: disconnectRun.id })).resolves.toMatchObject({ status: "cancelled" });
  });

  it("持久 snapshot 在进程重建后 resume，且不重放已成功的前置节点", async () => {
    const executed: string[] = [];
    const { port, root } = await fixture(true, (nodeId) => executed.push(nodeId));
    const started = await port.start({ workflow: workflow("__suspend__"), mode: "draft" });
    const deadline = Date.now() + 1_000;
    let waiting = await port.get(started.id);
    while (waiting?.status === "running" && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      waiting = await port.get(started.id);
    }
    expect(waiting?.status).toBe("waiting");
    await shutdownMastraRuntime({ root, persistenceEnabled: true });

    const restoredRuntime = await getOrCreateMastraRuntime({ root, persistenceEnabled: true });
    const restoredCompiler = new MastraWorkflowCompilerAdapter({
      mastra: restoredRuntime.mastra,
      executors: executorRegistry((nodeId) => executed.push(nodeId)),
    });
    const restored = new MastraWorkflowRuntimeAdapter({
      compiler: restoredCompiler,
      root,
      persistenceEnabled: true,
      stageECapabilities: ENABLED_STAGE_E_CAPABILITIES,
    });
    const resumed = await restored.resume({
      runId: started.id,
      stepId: "template",
      resumeData: { value: "approved" },
    });

    expect(resumed.status).toBe("succeeded");
    expect(executed.filter((nodeId) => nodeId === "start")).toHaveLength(1);
    expect(executed.filter((nodeId) => nodeId === "template")).toHaveLength(2);
    expect(executed.filter((nodeId) => nodeId === "end")).toHaveLength(1);
  });

  it("Workflow step 崩溃后明确收敛 failed 并关闭事件流", async () => {
    const { port } = await fixture();
    const started = await port.start({ workflow: workflow("__crash__"), mode: "draft" });
    const events = [];

    for await (const event of port.events({ runId: started.id })) events.push(event);

    expect(events.at(-1)).toMatchObject({ type: "run.status", status: "failed" });
    await expect(port.get(started.id)).resolves.toMatchObject({
      status: "failed",
      nodeRuns: { template: { status: "failed" } },
    });
  });

  it("取消与自然完成竞态只收敛一个不可逆终态", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const executed: string[] = [];
    const { port } = await fixture(false, (nodeId) => executed.push(nodeId), gate);
    const started = await port.start({ workflow: workflow("__race__"), mode: "draft" });
    const deadline = Date.now() + 1_000;
    while (!executed.includes("template") && Date.now() <= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const cancellation = port.cancel({ runId: started.id });
    release();
    const cancelled = await cancellation;
    const events = [];
    for await (const event of port.events({ runId: started.id })) events.push(event);
    const terminalEvents = events.filter((event) => (
      event.type === "run.status" && ["succeeded", "failed", "cancelled"].includes(event.status)
    ));

    expect(cancelled.status).toBe("cancelled");
    expect(terminalEvents).toHaveLength(1);
    expect(terminalEvents[0]).toMatchObject({ type: "run.status", status: "cancelled" });
    await expect(port.get(started.id)).resolves.toEqual(cancelled);
  });
});
