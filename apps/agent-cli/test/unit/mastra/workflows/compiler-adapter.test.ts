import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  WORKFLOW_SCHEMA_VERSION,
  builtinNodeRegistry,
  type WorkflowDraft,
  type WorkflowVersion,
} from "@orbit/workflow-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileWorkflowForRuntime } from "../../../../src/workflows/compiler-adapter.js";
import { createBuiltinWorkflowExecutorRegistry } from "../../../../src/workflows/executors/index.js";
import { MastraWorkflowAgentExecutor } from "../../../../src/mastra/workflows/agent-executor.js";
import { MastraWorkflowToolExecutor } from "../../../../src/mastra/workflows/tool-executor.js";
import { MastraToolExecutionAdapter } from "../../../../src/mastra/tools/tool-execution-adapter.js";
import {
  getOrCreateMastraRuntime,
  shutdownMastraRuntime,
} from "../../../../src/mastra/instance/factory.js";
import { MastraWorkflowCompilerAdapter } from "../../../../src/mastra/workflows/compiler-adapter.js";
import { createMastraWorkflowFrame } from "../../../../src/mastra/workflows/frame.js";

let root = "";

afterEach(async () => {
  if (root) {
    await shutdownMastraRuntime({ root, persistenceEnabled: false });
    await rm(root, { recursive: true, force: true });
  }
  root = "";
});

function node<T extends "start" | "template" | "variable" | "condition" | "llm" | "tool" | "http" | "code" | "knowledge" | "end" | "parallel" | "merge" | "iteration" | "loop" | "subworkflow" | "human-approval">(
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

function draft(): WorkflowDraft {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    id: "mastra-compiler",
    name: "Mastra Compiler",
    summary: "",
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      node("start", "start", { inputs: [{ id: "name", name: "名称", dataType: "string", required: true }] }),
      node("template", "template", {
        template: "你好 {{name}}",
        variables: { name: { kind: "variable", ref: { scope: "workflow-input", inputId: "name" } } },
      }),
      node("end", "end", {
        outputs: [{ id: "message", name: "消息", value: { scope: "node-output", nodeId: "template", portId: "text" } }],
      }),
    ],
    edges: [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "template", portId: "in" } },
      { id: "e2", source: { nodeId: "template", portId: "text" }, target: { nodeId: "end", portId: "in" } },
    ],
  };
}

describe("mastra/workflows/compiler-adapter", () => {
  it("按 Workflow identity、内容和 adapterVersion 缓存真实 Mastra Workflow", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-compiler-"));
    const runtime = await getOrCreateMastraRuntime({ root, persistenceEnabled: false });
    const registry = createBuiltinWorkflowExecutorRegistry();
    const compiler = new MastraWorkflowCompilerAdapter({ mastra: runtime.mastra, executors: registry });
    const ir = compileWorkflowForRuntime(draft(), { executors: registry.identities() });

    const first = compiler.compile(ir);
    const same = compiler.compile(ir);
    const changedDraft = draft();
    changedDraft.nodes[1] = node("template", "template", { template: "再见", variables: {} });
    const changed = compiler.compile(compileWorkflowForRuntime(changedDraft, { executors: registry.identities() }));

    expect(same).toBe(first);
    expect(changed).not.toBe(first);
    expect(runtime.mastra.getWorkflowById(first.runtimeWorkflowId)).toBe(first.workflow);
  });

  it("将 Start、Template、Variable 与 End 作为 typed steps 交给 Mastra 执行", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-basic-"));
    const runtime = await getOrCreateMastraRuntime({ root, persistenceEnabled: false });
    const registry = createBuiltinWorkflowExecutorRegistry();
    const compiler = new MastraWorkflowCompilerAdapter({ mastra: runtime.mastra, executors: registry });
    const compiled = compiler.compile(compileWorkflowForRuntime(draft(), { executors: registry.identities() }));
    const run = await compiled.workflow.createRun({ runId: "native-basic" });
    const result = await run.start({
      inputData: createMastraWorkflowFrame({ productRunId: "product-basic", workflowInputs: { name: "Orbit" } }),
    });

    expect(result).toMatchObject({
      status: "success",
      result: { output: { message: "你好 Orbit" } },
    });
  });

  it("将 Human Approval 直接编译为 Mastra 原生 run-scoped suspend", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-approval-"));
    const runtime = await getOrCreateMastraRuntime({ root, persistenceEnabled: false });
    const registry = createBuiltinWorkflowExecutorRegistry();
    const approvalDefinition = builtinNodeRegistry.get("human-approval")!;
    const approvalConfig = approvalDefinition.createDefaultConfig();
    approvalConfig.policyId = "policy-1";
    const source = draft();
    source.nodes = [
      node("start", "start", { inputs: [] }),
      node("human-approval", "approval", approvalConfig),
      node("end", "end", { outputs: [] }),
    ];
    source.edges = [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "approval", portId: "in" } },
      { id: "e2", source: { nodeId: "approval", portId: "approved" }, target: { nodeId: "end", portId: "in" } },
    ];
    const compiler = new MastraWorkflowCompilerAdapter({ mastra: runtime.mastra, executors: registry });
    const ir = compileWorkflowForRuntime(source, {
      executors: registry.identities(),
      approvalPolicies: { hasPolicy: () => true },
    });
    const compiled = compiler.compile(ir);
    const run = await compiled.workflow.createRun({ runId: "native-approval" });
    const result = await run.start({
      inputData: createMastraWorkflowFrame({
        productRunId: "product-approval",
        nativeRunId: "native-approval",
      }),
    });

    expect(result).toMatchObject({
      status: "suspended",
      suspendPayload: {
        approval: {
          kind: "approval",
          interruptId: expect.stringMatching(/^interrupt_/),
          approvalRequestId: expect.stringMatching(/^interrupt_/),
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/resumeToken|checkpoint/);
  });

  it("Human Approval resume 只执行决定对应的输出分支", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-approval-branches-"));
    const runtime = await getOrCreateMastraRuntime({ root, persistenceEnabled: false });
    const registry = createBuiltinWorkflowExecutorRegistry();
    const approvalDefinition = builtinNodeRegistry.get("human-approval")!;
    const approvalConfig = approvalDefinition.createDefaultConfig();
    approvalConfig.policyId = "policy-1";
    approvalConfig.decisionSchema = {
      type: "object",
      properties: { comment: { type: "string" } },
      required: ["comment"],
      additionalProperties: false,
    };
    const source = draft();
    source.nodes = [
      node("start", "start", { inputs: [] }),
      node("human-approval", "approval", approvalConfig),
      node("end", "approved-end", {
        outputs: [{ id: "decision", name: "决定", value: { scope: "node-output", nodeId: "approval", portId: "approved" } }],
      }),
      node("end", "rejected-end", {
        outputs: [{ id: "decision", name: "决定", value: { scope: "node-output", nodeId: "approval", portId: "rejected" } }],
      }),
    ];
    source.edges = [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "approval", portId: "in" } },
      { id: "e2", source: { nodeId: "approval", portId: "approved" }, target: { nodeId: "approved-end", portId: "in" } },
      { id: "e3", source: { nodeId: "approval", portId: "rejected" }, target: { nodeId: "rejected-end", portId: "in" } },
    ];
    const compiler = new MastraWorkflowCompilerAdapter({ mastra: runtime.mastra, executors: registry });
    const compiled = compiler.compile(compileWorkflowForRuntime(source, {
      executors: registry.identities(),
      approvalPolicies: { hasPolicy: () => true },
    }));

    const approveRun = await compiled.workflow.createRun({ runId: "native-approval-approve-branch" });
    const approveWaiting = await approveRun.start({
      inputData: createMastraWorkflowFrame({
        productRunId: "product-approval-approve-branch",
        nativeRunId: "native-approval-approve-branch",
      }),
    });
    const approvePayload = (approveWaiting as { suspendPayload?: { approval?: { interruptId?: string } } }).suspendPayload?.approval;
    const approveResult = await approveRun.resume({
      step: "approval",
      resumeData: { interruptId: approvePayload?.interruptId, action: "approve", data: { comment: "ok" } },
    });
    expect(approveResult).toMatchObject({
      status: "success",
      result: {
        nodeOutputs: {
          "approved-end": { decision: { action: "approve" } },
        },
      },
    });
    expect((approveResult as { result?: { nodeOutputs?: Record<string, unknown> } }).result?.nodeOutputs).not.toHaveProperty("rejected-end");

    const rejectRun = await compiled.workflow.createRun({ runId: "native-approval-reject-branch" });
    const rejectWaiting = await rejectRun.start({
      inputData: createMastraWorkflowFrame({
        productRunId: "product-approval-reject-branch",
        nativeRunId: "native-approval-reject-branch",
      }),
    });
    const rejectPayload = (rejectWaiting as { suspendPayload?: { approval?: { interruptId?: string } } }).suspendPayload?.approval;
    const rejectResult = await rejectRun.resume({
      step: "approval",
      resumeData: { interruptId: rejectPayload?.interruptId, action: "reject", data: { comment: "no" } },
    });
    expect(rejectResult).toMatchObject({
      status: "success",
      result: {
        nodeOutputs: {
          "rejected-end": { decision: { action: "reject" } },
        },
      },
    });
    expect((rejectResult as { result?: { nodeOutputs?: Record<string, unknown> } }).result?.nodeOutputs).not.toHaveProperty("approved-end");
  });

  it("将 Parallel 分支编译为 bounded foreach，并只在 Merge 后继续顶层流程", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-parallel-"));
    const runtime = await getOrCreateMastraRuntime({ root, persistenceEnabled: false });
    const registry = createBuiltinWorkflowExecutorRegistry();
    const parallelDefinition = builtinNodeRegistry.get("parallel")!;
    const parallelConfig = parallelDefinition.createDefaultConfig();
    parallelConfig.branches = [{ id: "left", label: "Left" }, { id: "right", label: "Right" }];
    parallelConfig.maxConcurrency = 2;
    const mergeDefinition = builtinNodeRegistry.get("merge")!;
    const mergeConfig = mergeDefinition.createDefaultConfig();
    mergeConfig.parallelNodeId = "parallel";
    const source: WorkflowDraft = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "mastra-parallel-compiler",
      name: "Parallel Compiler",
      summary: "",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        node("start", "start", { inputs: [] }),
        node("parallel", "parallel", parallelConfig),
        node("template", "left", { template: "left", variables: {} }),
        node("template", "right", { template: "right", variables: {} }),
        node("merge", "merge", mergeConfig),
        node("end", "end", { outputs: [] }),
      ],
      edges: [
        { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "parallel", portId: "in" } },
        { id: "e2", source: { nodeId: "parallel", portId: "left" }, target: { nodeId: "left", portId: "in" } },
        { id: "e3", source: { nodeId: "parallel", portId: "right" }, target: { nodeId: "right", portId: "in" } },
        { id: "e4", source: { nodeId: "left", portId: "text" }, target: { nodeId: "merge", portId: "branches" } },
        { id: "e5", source: { nodeId: "right", portId: "text" }, target: { nodeId: "merge", portId: "branches" } },
        { id: "e6", source: { nodeId: "merge", portId: "result" }, target: { nodeId: "end", portId: "in" } },
      ],
    };
    const compiler = new MastraWorkflowCompilerAdapter({ mastra: runtime.mastra, executors: registry });
    const compiled = compiler.compile(compileWorkflowForRuntime(source));
    const run = await compiled.workflow.createRun({ runId: "native-compiled-parallel" });
    const result = await run.start({ inputData: createMastraWorkflowFrame({ productRunId: "product-compiled-parallel" }) });

    expect(result).toMatchObject({
      status: "success",
      result: {
        nodeOutputs: {
          left: { text: "left" },
          right: { text: "right" },
          merge: {
            result: [
              { branchId: "left", status: "succeeded", output: { text: "left" } },
              { branchId: "right", status: "succeeded", output: { text: "right" } },
            ],
          },
        },
      },
    });
  });

  it("将 Iteration body 编译为 bounded foreach，并注入 item/index 变量上下文", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-iteration-"));
    const runtime = await getOrCreateMastraRuntime({ root, persistenceEnabled: false });
    const registry = createBuiltinWorkflowExecutorRegistry();
    const iterationDefinition = builtinNodeRegistry.get("iteration")!;
    const iterationConfig = iterationDefinition.createDefaultConfig();
    iterationConfig.items = { kind: "literal", value: ["a", "b"] };
    iterationConfig.maxItems = 2;
    iterationConfig.maxConcurrency = 2;
    const bodyNode = node("template", "iteration-template", {
      template: "{{item}}-{{index}}",
      variables: {
        item: { kind: "variable", ref: { scope: "loop", containerNodeId: "iteration", key: "item" } },
        index: { kind: "variable", ref: { scope: "loop", containerNodeId: "iteration", key: "index" } },
      },
    });
    iterationConfig.body.nodes = [bodyNode];
    iterationConfig.body.outputs = [{
      id: "text",
      name: "文本",
      dataType: "string",
      value: { scope: "node-output", nodeId: bodyNode.id, portId: "text" },
    }];
    const source: WorkflowDraft = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "mastra-iteration-compiler",
      name: "Iteration Compiler",
      summary: "",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        node("start", "start", { inputs: [] }),
        node("iteration", "iteration", iterationConfig),
        node("end", "end", { outputs: [] }),
      ],
      edges: [
        { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "iteration", portId: "items" } },
        { id: "e2", source: { nodeId: "iteration", portId: "results" }, target: { nodeId: "end", portId: "in" } },
      ],
    };
    const compiler = new MastraWorkflowCompilerAdapter({ mastra: runtime.mastra, executors: registry });
    const compiled = compiler.compile(compileWorkflowForRuntime(source));
    const run = await compiled.workflow.createRun({ runId: "native-compiled-iteration" });
    const result = await run.start({ inputData: createMastraWorkflowFrame({ productRunId: "product-compiled-iteration" }) });

    expect(result).toMatchObject({
      status: "success",
      result: {
        nodeOutputs: {
          iteration: { results: [{ text: "a-0" }, { text: "b-1" }] },
        },
      },
    });
  });

  it("将 Loop body 编译为带零次守卫的 Mastra dowhile", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-loop-"));
    const runtime = await getOrCreateMastraRuntime({ root, persistenceEnabled: false });
    const registry = createBuiltinWorkflowExecutorRegistry();
    const loopDefinition = builtinNodeRegistry.get("loop")!;
    const loopConfig = loopDefinition.createDefaultConfig();
    loopConfig.condition = "state !== 'done'";
    loopConfig.maxIterations = 3;
    loopConfig.initialVariables = [{
      id: "state",
      name: "State",
      dataType: "string",
      value: { kind: "literal", value: "start" },
    }];
    const bodyNode = node("template", "loop-template", { template: "done", variables: {} });
    loopConfig.body.nodes = [bodyNode];
    loopConfig.body.outputs = [{
      id: "state",
      name: "State",
      dataType: "string",
      value: { scope: "node-output", nodeId: bodyNode.id, portId: "text" },
    }];
    const source: WorkflowDraft = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "mastra-loop-compiler",
      name: "Loop Compiler",
      summary: "",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        node("start", "start", { inputs: [] }),
        node("loop", "loop", loopConfig),
        node("end", "end", { outputs: [] }),
      ],
      edges: [
        { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "loop", portId: "in" } },
        { id: "e2", source: { nodeId: "loop", portId: "output:state" }, target: { nodeId: "end", portId: "in" } },
      ],
    };
    const compiler = new MastraWorkflowCompilerAdapter({ mastra: runtime.mastra, executors: registry });
    const compiled = compiler.compile(compileWorkflowForRuntime(source));
    const run = await compiled.workflow.createRun({ runId: "native-compiled-loop" });

    await expect(run.start({ inputData: createMastraWorkflowFrame({ productRunId: "product-compiled-loop" }) })).resolves.toMatchObject({
      status: "success",
      result: { nodeOutputs: { loop: { "output:state": "done" } } },
    });
  });

  it("将固定 Subworkflow 版本编译为 nested Workflow，并按声明绑定输入输出", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-subworkflow-"));
    const runtime = await getOrCreateMastraRuntime({ root, persistenceEnabled: false });
    const registry = createBuiltinWorkflowExecutorRegistry();
    const childVersion: WorkflowVersion = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "child-v1",
      workflowId: "child-workflow",
      version: 1,
      contentHash: "child-hash-v1",
      createdAt: 1,
      createdBy: "test",
      nodes: [
        node("start", "child-start", {
          inputs: [{ id: "name", name: "名称", dataType: "string", required: true }],
        }),
        node("template", "child-template", {
          template: "child:{{name}}",
          variables: { name: { kind: "variable", ref: { scope: "workflow-input", inputId: "name" } } },
        }),
        node("end", "child-end", {
          outputs: [{ id: "message", name: "消息", value: { scope: "node-output", nodeId: "child-template", portId: "text" } }],
        }),
      ],
      edges: [
        { id: "ce1", source: { nodeId: "child-start", portId: "out" }, target: { nodeId: "child-template", portId: "in" } },
        { id: "ce2", source: { nodeId: "child-template", portId: "text" }, target: { nodeId: "child-end", portId: "in" } },
      ],
    };
    const subworkflowDefinition = builtinNodeRegistry.get("subworkflow")!;
    const subworkflowConfig = subworkflowDefinition.createDefaultConfig();
    subworkflowConfig.workflowId = childVersion.workflowId;
    subworkflowConfig.versionId = childVersion.id;
    subworkflowConfig.contentHash = childVersion.contentHash;
    subworkflowConfig.inputBindings = [{
      inputId: "name",
      value: { kind: "variable", ref: { scope: "workflow-input", inputId: "parentName" } },
    }];
    subworkflowConfig.outputBindings = [{ outputId: "message", name: "消息", dataType: "string" }];
    const source: WorkflowVersion = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      id: "parent-v1",
      workflowId: "parent-workflow",
      version: 1,
      contentHash: "parent-hash-v1",
      createdAt: 1,
      createdBy: "test",
      nodes: [
        node("start", "start", {
          inputs: [{ id: "parentName", name: "父名称", dataType: "string", required: true }],
        }),
        node("subworkflow", "subworkflow", subworkflowConfig),
        node("end", "end", {
          outputs: [{ id: "result", name: "结果", value: { scope: "node-output", nodeId: "subworkflow", portId: "output:message" } }],
        }),
      ],
      edges: [
        { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "subworkflow", portId: "input:name" } },
        { id: "e2", source: { nodeId: "subworkflow", portId: "output:message" }, target: { nodeId: "end", portId: "in" } },
      ],
    };
    const ir = compileWorkflowForRuntime(source, {
      workflowVersions: { resolvePublishedVersion: () => childVersion },
    });
    const compiler = new MastraWorkflowCompilerAdapter({ mastra: runtime.mastra, executors: registry });
    const compiled = compiler.compile(ir);
    const run = await compiled.workflow.createRun({ runId: "native-subworkflow" });

    await expect(run.start({
      inputData: createMastraWorkflowFrame({
        productRunId: "product-subworkflow",
        workflowInputs: { parentName: "Orbit" },
      }),
    })).resolves.toMatchObject({
      status: "success",
      result: {
        output: { result: "child:Orbit" },
        nodeOutputs: {
          subworkflow: { "output:message": "child:Orbit" },
        },
      },
    });
  });

  it("父版本 identity 不变时仍将 Subworkflow dependency identity 纳入 compiler cache key", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-subworkflow-cache-"));
    const runtime = await getOrCreateMastraRuntime({ root, persistenceEnabled: false });
    const registry = createBuiltinWorkflowExecutorRegistry();
    const compiler = new MastraWorkflowCompilerAdapter({ mastra: runtime.mastra, executors: registry });
    const base = compileWorkflowForRuntime(draft(), { executors: registry.identities() });
    const first = structuredClone(base);
    first.source = {
      kind: "version",
      workflowId: "parent-workflow",
      versionId: "parent-v1",
      version: 1,
      contentHash: "parent-hash",
    };
    const dependency = {
      kind: "workflow-version" as const,
      workflowId: "child-workflow",
      versionId: "child-v1",
      version: 1,
      contentHash: "child-hash-v1",
    };
    first.dependencies = [...first.dependencies, dependency];
    const second = structuredClone(first);
    second.dependencies = second.dependencies.map((item) => item.kind === "workflow-version"
      ? { ...item, versionId: "child-v2", version: 2, contentHash: "child-hash-v2" }
      : item);

    const compiledFirst = compiler.compile(first);
    const compiledSame = compiler.compile(structuredClone(first));
    const compiledSecond = compiler.compile(second);

    expect(compiledSame).toBe(compiledFirst);
    expect(compiledSecond.cacheKey).not.toBe(compiledFirst.cacheKey);
    expect(compiledSecond.runtimeWorkflowId).not.toBe(compiledFirst.runtimeWorkflowId);
  });

  it("将 Condition 映射为 Mastra branch，并在无匹配分支时显式失败", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-branch-"));
    const runtime = await getOrCreateMastraRuntime({ root, persistenceEnabled: false });
    const registry = createBuiltinWorkflowExecutorRegistry();
    const source = draft();
    source.nodes = [
      node("start", "start", { inputs: [{ id: "score", name: "分数", dataType: "number", required: true }] }),
      node("condition", "condition", {
        expression: "value >= 8",
        cases: [
          { id: "yes", label: "通过", expression: "value >= 8" },
          { id: "no", label: "拒绝", expression: "value < 0" },
        ],
      }),
      node("end", "end", { outputs: [] }),
    ];
    source.edges = [
      { id: "e1", source: { nodeId: "start", portId: "input:score" }, target: { nodeId: "condition", portId: "in" } },
      { id: "e2", source: { nodeId: "condition", portId: "yes" }, target: { nodeId: "end", portId: "in" } },
      { id: "e3", source: { nodeId: "condition", portId: "no" }, target: { nodeId: "end", portId: "in" } },
    ];
    const compiler = new MastraWorkflowCompilerAdapter({ mastra: runtime.mastra, executors: registry });
    const compiled = compiler.compile(compileWorkflowForRuntime(source, { executors: registry.identities() }));

    const successRun = await compiled.workflow.createRun({ runId: "native-branch-success" });
    await expect(successRun.start({
      inputData: createMastraWorkflowFrame({ productRunId: "product-branch-success", workflowInputs: { score: 9 } }),
    })).resolves.toMatchObject({ status: "success", result: { selectedPorts: { condition: ["yes"] } } });

    const failedRun = await compiled.workflow.createRun({ runId: "native-branch-failed" });
    const expectedFailureLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(failedRun.start({
        inputData: createMastraWorkflowFrame({ productRunId: "product-branch-failed", workflowInputs: { score: 5 } }),
      })).resolves.toMatchObject({ status: "failed" });
    } finally {
      expectedFailureLog.mockRestore();
    }

    const defaultSource = structuredClone(source);
    const condition = defaultSource.nodes.find((item) => item.id === "condition");
    if (!condition || condition.kind !== "builtin" || condition.type !== "condition") throw new Error("fixture error");
    condition.config.cases[1]!.expression = "true";
    const defaultCompiled = compiler.compile(compileWorkflowForRuntime(defaultSource, { executors: registry.identities() }));
    const defaultRun = await defaultCompiled.workflow.createRun({ runId: "native-branch-default" });
    await expect(defaultRun.start({
      inputData: createMastraWorkflowFrame({ productRunId: "product-branch-default", workflowInputs: { score: 5 } }),
    })).resolves.toMatchObject({
      status: "success",
      result: { selectedPorts: { condition: ["no"] } },
    });
  });

  it("将 HTTP、Code 和 Knowledge 节点映射为委托现有服务的 typed steps", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-services-"));
    const runtime = await getOrCreateMastraRuntime({ root, persistenceEnabled: false });
    const request = vi.fn().mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 7 }),
    });
    const run = vi.fn().mockResolvedValue(8);
    const search = vi.fn().mockResolvedValue({ documents: [{ id: "doc-1" }], text: "knowledge" });
    const registry = createBuiltinWorkflowExecutorRegistry({
      httpClient: { request },
      codeRunner: { run },
      knowledgeService: { search },
    });
    const source = draft();
    source.nodes = [
      node("start", "start", { inputs: [] }),
      node("http", "http", {
        method: "GET",
        url: { kind: "literal", value: "https://93.184.216.34/data" },
        headers: {},
        timeoutMs: 1_000,
      }),
      node("code", "code", { language: "javascript", source: "return input;", inputs: {} }),
      node("knowledge", "knowledge", {
        knowledgeBaseId: "kb-1",
        query: { kind: "literal", value: "orbit" },
        topK: 3,
      }),
      node("end", "end", { outputs: [] }),
    ];
    source.edges = [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "http", portId: "in" } },
      { id: "e2", source: { nodeId: "http", portId: "body" }, target: { nodeId: "code", portId: "in" } },
      { id: "e3", source: { nodeId: "code", portId: "result" }, target: { nodeId: "knowledge", portId: "in" } },
      { id: "e4", source: { nodeId: "knowledge", portId: "text" }, target: { nodeId: "end", portId: "in" } },
    ];
    const compiler = new MastraWorkflowCompilerAdapter({ mastra: runtime.mastra, executors: registry });
    const compiled = compiler.compile(compileWorkflowForRuntime(source, { executors: registry.identities() }));
    const nativeRun = await compiled.workflow.createRun({ runId: "native-services" });

    await expect(nativeRun.start({
      inputData: createMastraWorkflowFrame({ productRunId: "product-services" }),
    })).resolves.toMatchObject({ status: "success" });
    expect(request).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledOnce();
  });

  it("将 LLM 与 Tool 节点分别委托共享 Mastra Agent 和 Mastra Tool Adapter", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-workflow-agent-tool-"));
    const runtime = await getOrCreateMastraRuntime({ root, persistenceEnabled: false });
    const agentStream = vi.fn().mockResolvedValue({ text: "agent-output", usage: { inputTokens: 1, outputTokens: 1 } });
    const toolExecute = vi.fn().mockResolvedValue({
      toolId: "normalize",
      output: { normalized: true },
      startedAt: 1,
      finishedAt: 2,
    });
    const toolAdapter = new MastraToolExecutionAdapter({
      list: vi.fn().mockResolvedValue([{
        id: "normalize",
        name: "normalize",
        description: "Normalize",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        source: "builtin",
        traits: { readOnly: true, idempotent: true, cancellable: true, sideEffecting: false },
      }]),
      execute: toolExecute,
    });
    const registry = createBuiltinWorkflowExecutorRegistry()
      .register(new MastraWorkflowAgentExecutor({ stream: agentStream }))
      .register(new MastraWorkflowToolExecutor(toolAdapter));
    const source = draft();
    source.nodes = [
      node("start", "start", { inputs: [] }),
      node("llm", "llm", { model: "gpt-test", prompt: { kind: "literal", value: "hello" } }),
      node("tool", "tool", { toolId: "normalize", arguments: { text: { kind: "literal", value: "hello" } } }),
      node("end", "end", { outputs: [] }),
    ];
    source.edges = [
      { id: "e1", source: { nodeId: "start", portId: "out" }, target: { nodeId: "llm", portId: "in" } },
      { id: "e2", source: { nodeId: "llm", portId: "text" }, target: { nodeId: "tool", portId: "in" } },
      { id: "e3", source: { nodeId: "tool", portId: "result" }, target: { nodeId: "end", portId: "in" } },
    ];
    const compiler = new MastraWorkflowCompilerAdapter({ mastra: runtime.mastra, executors: registry });
    const compiled = compiler.compile(compileWorkflowForRuntime(source, { executors: registry.identities() }));
    const nativeRun = await compiled.workflow.createRun({ runId: "native-agent-tool" });

    await expect(nativeRun.start({
      inputData: createMastraWorkflowFrame({
        productRunId: "product-agent-tool",
        requestContext: { ownerId: "owner-1" },
      }),
    })).resolves.toMatchObject({
      status: "success",
      result: {
        nodeOutputs: {
          llm: { text: "agent-output" },
          tool: { result: { normalized: true } },
        },
      },
    });
    expect(agentStream).toHaveBeenCalledOnce();
    expect(toolExecute).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: "owner-1",
      executor: { kind: "workflow", runId: "product-agent-tool", nodeId: "tool" },
    }));
  });
});
