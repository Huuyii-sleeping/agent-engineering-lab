import { createStep, createWorkflow } from "@mastra/core/workflows";
import { builtinNodeRegistry, type WorkflowIRLoopNode } from "@orbit/workflow-core";
import { describe, expect, it } from "vitest";
import {
  advanceLoopFrame,
  assertLoopCompleted,
  createMastraLoopContainerWorkflow,
  evaluateLoopBusinessCondition,
  loopLimitReason,
  mergeLoopFrame,
  prepareLoopFrame,
} from "../../../../src/mastra/workflows/loop-steps.js";
import {
  MASTRA_WORKFLOW_FRAME_SCHEMA,
  createMastraWorkflowFrame,
  createMastraWorkflowVariableContext,
} from "../../../../src/mastra/workflows/frame.js";

function loopNode(): WorkflowIRLoopNode {
  const definition = builtinNodeRegistry.get("loop")!;
  const config = definition.createDefaultConfig();
  config.inputBindings = [{ inputId: "prefix", value: { kind: "literal", value: "orbit" } }];
  config.initialVariables = [{ id: "count", name: "Count", dataType: "integer", value: { kind: "literal", value: 0 } }];
  config.body.outputs = [{
    id: "count",
    name: "Count",
    dataType: "integer",
    value: { scope: "node-output", nodeId: "loop-body", portId: "result" },
  }];
  return {
    id: "loop-1",
    type: "loop",
    nodeVersion: definition.version,
    label: "循环",
    disabled: false,
    config,
    ports: definition.createPorts(config),
    executor: definition.executor,
    execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: true, onError: "fail" },
    kind: "loop",
    body: {
      nodes: [],
      edges: [],
      topology: {
        orderedNodeIds: ["loop-body"],
        entryNodeIds: ["loop-body"],
        terminalNodeIds: ["loop-body"],
        dependencies: { "loop-body": [] },
        dependents: { "loop-body": [] },
      },
    },
  };
}

describe("loop steps", () => {
  it("初始化稳定 identity、startedAt、iteration、显式输入和 loop variables", async () => {
    const node = loopNode();
    const parent = createMastraWorkflowFrame({ productRunId: "loop-run", executionPath: ["root"] });
    const first = await prepareLoopFrame(node, parent, 100);
    const second = await prepareLoopFrame(node, parent, 100);

    expect(first).toMatchObject({
      containerId: "loop-1",
      executionPath: ["root", "loop-1"],
      containerContexts: {
        "loop-1": {
          inputs: { prefix: "orbit" },
          iteration: 0,
          startedAt: 100,
          variables: { count: 0 },
          previousOutputs: {},
        },
      },
    });
    expect(first.instanceId).toBe(second.instanceId);
    const variables = createMastraWorkflowVariableContext(first);
    await expect(variables.resolve({ scope: "container-input", containerNodeId: "loop-1", inputId: "prefix" })).resolves.toBe("orbit");
    await expect(variables.resolve({ scope: "loop", containerNodeId: "loop-1", key: "variable", variableId: "count" })).resolves.toBe(0);
  });

  it("推进 iteration、保存声明输出并更新同名 loop variable", async () => {
    const node = loopNode();
    const prepared = await prepareLoopFrame(node, createMastraWorkflowFrame({ productRunId: "loop-run" }), 100);
    const advanced = await advanceLoopFrame(node, {
      ...prepared,
      nodeOutputs: { "loop-body": { result: 1 } },
    });

    expect(advanced.containerContexts["loop-1"]).toMatchObject({
      iteration: 1,
      startedAt: 100,
      variables: { count: 1 },
      previousOutputs: { count: 1 },
    });
  });

  it("将最后一次声明输出写回 Loop 端口并恢复父 identity", async () => {
    const node = loopNode();
    const parent = createMastraWorkflowFrame({ productRunId: "loop-run", executionPath: ["root"] });
    const prepared = await prepareLoopFrame(node, parent, 100);
    const advanced = await advanceLoopFrame(node, {
      ...prepared,
      nodeOutputs: { "loop-body": { result: 2 } },
    });
    const merged = mergeLoopFrame(node, parent, advanced);

    expect(merged.executionPath).toEqual(["root"]);
    expect(merged.nodeOutputs["loop-1"]).toEqual({ "output:count": 2 });
    expect(merged.nodeOutputs["loop-body"]).toEqual({ result: 2 });
  });

  it("while 使用前置零次守卫和 Mastra dowhile 执行 body", async () => {
    const node = loopNode();
    node.config.condition = "count < 3";
    let executions = 0;
    const body = createWorkflow({
      id: "loop-while-body",
      inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    }).then(createStep({
      id: "loop-while-increment",
      inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      execute: async ({ inputData }) => {
        executions += 1;
        const count = Number(inputData.containerContexts["loop-1"]?.variables?.count ?? 0) + 1;
        return { ...inputData, nodeOutputs: { ...inputData.nodeOutputs, "loop-body": { result: count } } };
      },
    })).commit();
    const workflow = createMastraLoopContainerWorkflow(node, body, { maxIterations: 10, maxRuntimeMs: 1_000 });
    const run = await workflow.createRun({ runId: "native-loop-while" });
    const result = await run.start({ inputData: createMastraWorkflowFrame({ productRunId: "product-loop-while" }) });

    expect(result).toMatchObject({
      status: "success",
      result: { nodeOutputs: { "loop-1": { "output:count": 3 } } },
    });
    expect(executions).toBe(3);

    const zeroNode = loopNode();
    zeroNode.config.condition = "count < 0";
    executions = 0;
    const zeroWorkflow = createMastraLoopContainerWorkflow(zeroNode, body, { maxIterations: 10, maxRuntimeMs: 1_000 });
    const zeroRun = await zeroWorkflow.createRun({ runId: "native-loop-zero" });
    await expect(zeroRun.start({ inputData: createMastraWorkflowFrame({ productRunId: "product-loop-zero" }) })).resolves.toMatchObject({
      status: "success",
    });
    expect(executions).toBe(0);
  });

  it("until 使用 Mastra dountil，并在业务条件满足时停止", async () => {
    const node = loopNode();
    node.config.mode = "until";
    node.config.condition = "count >= 2";
    let executions = 0;
    const body = createWorkflow({
      id: "loop-until-body",
      inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
    }).then(createStep({
      id: "loop-until-increment",
      inputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      outputSchema: MASTRA_WORKFLOW_FRAME_SCHEMA,
      execute: async ({ inputData }) => {
        executions += 1;
        const count = Number(inputData.containerContexts["loop-1"]?.variables?.count ?? 0) + 1;
        return { ...inputData, nodeOutputs: { ...inputData.nodeOutputs, "loop-body": { result: count } } };
      },
    })).commit();
    const workflow = createMastraLoopContainerWorkflow(node, body, { maxIterations: 10, maxRuntimeMs: 1_000 });
    const run = await workflow.createRun({ runId: "native-loop-until" });
    await expect(run.start({ inputData: createMastraWorkflowFrame({ productRunId: "product-loop-until" }) })).resolves.toMatchObject({
      status: "success",
      result: { nodeOutputs: { "loop-1": { "output:count": 2 } } },
    });
    expect(executions).toBe(2);
  });

  it("条件与硬限制共同决定下一次执行，guard 输出结构化 limit exceeded", async () => {
    const node = loopNode();
    node.config.condition = "true";
    const prepared = await prepareLoopFrame(node, createMastraWorkflowFrame({ productRunId: "loop-limit" }), 100);
    const limited = {
      ...prepared,
      containerContexts: {
        ...prepared.containerContexts,
        "loop-1": { ...prepared.containerContexts["loop-1"]!, iteration: 2 },
      },
    };

    expect(evaluateLoopBusinessCondition(node, limited)).toBe(true);
    expect(loopLimitReason(node, limited, { maxIterations: 2, maxRuntimeMs: 1_000 }, 200)).toBe("iterations");
    expect(() => assertLoopCompleted(node, limited, { maxIterations: 2, maxRuntimeMs: 1_000 }, 200)).toThrowError(
      expect.objectContaining({ code: "WORKFLOW_LOOP_LIMIT_EXCEEDED", reason: "iterations" }),
    );
  });
});
