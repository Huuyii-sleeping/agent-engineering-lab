import type { AgentVersion, WorkflowIRAgentNode } from "@orbit/workflow-core";
import type { AgentRuntimeEvent, AgentRuntimePort } from "@orbit/runtime-contracts";
import { describe, expect, it, vi } from "vitest";
import { WorkflowVariableContext } from "../../../../src/workflows/context.js";
import {
  MastraWorkflowAgentNodeExecutor,
  deriveChildAgentRunId,
} from "../../../../src/mastra/workflows/agent-node-executor.js";

const node: WorkflowIRAgentNode = {
  kind: "agent",
  id: "agent-node",
  type: "agent",
  nodeVersion: 1,
  label: "Agent",
  disabled: false,
  config: {
    agentProfileId: "profile-1",
    agentVersionId: "agent-v1",
    inputBindings: { task: { kind: "literal", value: "review" } },
    outputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
      additionalProperties: false,
    },
    memory: { isolation: "node-run", shareThread: false },
  },
  ports: { inputs: [], outputs: [] },
  executor: { id: "workflow.agent", version: 1 },
  execution: { timeoutMs: 1_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: false, onError: "fail" },
  childRun: { agentProfileId: "profile-1", agentVersionId: "agent-v1", contentHash: "agent-hash-v1", memoryIsolation: "node-run" },
};

const version: AgentVersion = {
  id: "agent-v1",
  agentProfileId: "profile-1",
  version: 1,
  contentHash: "agent-hash-v1",
  name: "Review Agent",
  description: "",
  instructions: ["Review carefully."],
  toolPolicy: { allowedToolIds: ["read-file"] },
  skillPolicy: { bindings: [{
    skillId: "review-skill",
    version: "1.0.0",
    sourceType: "builtin",
    registrySource: "official",
  }] },
  outputSchema: node.config.outputSchema,
  createdBy: "test",
  releaseNotes: "",
  createdAt: 1,
};

function runtime(events: AgentRuntimeEvent[]): AgentRuntimePort {
  return {
    capabilities: vi.fn(),
    generate: vi.fn(),
    getRun: vi.fn(),
    cancel: vi.fn(),
    stream: vi.fn(async function* () {
      for (const event of events) yield event;
    }),
  };
}

function context(
  requestContext: Record<string, unknown> = { ownerId: "owner-1" },
  signal: AbortSignal = new AbortController().signal,
) {
  return {
    runId: "parent-run",
    workflowId: "workflow-1",
    requestContext,
    node,
    inputs: {},
    attempt: 1,
    variables: new WorkflowVariableContext({ inputs: {} }),
    signal,
    emitLog: vi.fn(),
    emitDelta: vi.fn(),
  };
}

describe("mastra/workflows/agent-node-executor", () => {
  it("按 parent run、node instance 与 attempt 稳定预分配 childAgentRunId", () => {
    expect(deriveChildAgentRunId("parent-run", "node-instance", 1)).toBe(
      deriveChildAgentRunId("parent-run", "node-instance", 1),
    );
    expect(deriveChildAgentRunId("parent-run", "node-instance", 2)).not.toBe(
      deriveChildAgentRunId("parent-run", "node-instance", 1),
    );
  });

  it("从可信 owner 派生隔离 session/thread，并只使用发布版本 Tool/Skill policy", async () => {
    const port = runtime([
      { id: 1, runId: "child", at: 1, type: "text.delta", delta: "done" },
      { id: 2, runId: "child", at: 2, type: "usage", usage: { inputTokens: 2, outputTokens: 1 } },
      {
        id: 3,
        runId: "child",
        at: 3,
        type: "run.final",
        result: {
          id: "child",
          status: "succeeded",
          createdAt: 1,
          sessionId: "session",
          resourceId: "resource",
          threadId: "thread",
          binding: { backend: "mastra", adapterVersion: "test", nativeRunId: "native" },
          text: "done",
          toolExecutions: [],
        },
      },
    ]);
    const executor = new MastraWorkflowAgentNodeExecutor({
      runtime: port,
      resolveVersion: () => version,
    });
    const execution = context({
      ownerId: "owner-1",
      allowedToolIds: ["forged-tool"],
      allowedSkillIds: ["forged-skill"],
      shareThread: true,
    });

    await expect(executor.execute(execution)).resolves.toEqual({
      outputs: { result: { text: "done" } },
      eventIdentity: { childRunId: expect.stringMatching(/^agent-child-/) },
    });
    expect(execution.emitDelta).toHaveBeenCalledWith("done", {
      childRunId: expect.stringMatching(/^agent-child-/),
    });
    expect(port.stream).toHaveBeenCalledWith(expect.objectContaining({
      runId: expect.stringMatching(/^agent-child-/),
      agentId: "profile-1",
      agentVersion: "agent-v1",
      resourceId: expect.stringMatching(/^workflow-resource-/),
      sessionId: expect.stringMatching(/^workflow-agent-session-/),
      threadId: expect.stringMatching(/^workflow-agent-thread-/),
      requestContext: expect.objectContaining({ ownerId: "owner-1", parentWorkflowRunId: "parent-run", parentNodeId: "agent-node" }),
      policy: { allowedToolIds: ["read-file"], allowedSkillIds: ["review-skill"] },
      messages: [
        { role: "system", content: "Review carefully." },
        { role: "user", content: "{\"task\":\"review\"}" },
      ],
    }));
    const firstCommand = vi.mocked(port.stream).mock.calls[0]![0];
    expect(firstCommand.requestContext).not.toHaveProperty("allowedToolIds");
    expect(firstCommand.requestContext).not.toHaveProperty("allowedSkillIds");
    expect(firstCommand.requestContext).not.toHaveProperty("shareThread");

    await executor.execute({ ...context(), nodeInstanceId: "agent-instance-2" });
    const secondCommand = vi.mocked(port.stream).mock.calls[1]![0];
    expect(secondCommand.resourceId).toBe(firstCommand.resourceId);
    expect(secondCommand.sessionId).not.toBe(firstCommand.sessionId);
    expect(secondCommand.threadId).not.toBe(firstCommand.threadId);
  });

  it("缺少可信 owner 时在启动 child run 前失败", async () => {
    const port = runtime([]);
    const executor = new MastraWorkflowAgentNodeExecutor({ runtime: port, resolveVersion: () => version });

    await expect(executor.execute(context({}))).rejects.toMatchObject({ code: "WORKFLOW_AGENT_OWNER_REQUIRED" });
    expect(port.stream).not.toHaveBeenCalled();
  });

  it("版本 identity 或 contentHash 不一致时禁止启动 child run", async () => {
    const port = runtime([]);
    const executor = new MastraWorkflowAgentNodeExecutor({
      runtime: port,
      resolveVersion: () => ({ ...version, id: "agent-v2" }),
    });

    await expect(executor.execute(context())).rejects.toMatchObject({
      code: "WORKFLOW_AGENT_VERSION_NOT_FOUND",
    });
    expect(port.stream).not.toHaveBeenCalled();
  });

  it("父 AbortSignal 触发后取消并查询稳定 child 终态", async () => {
    const controller = new AbortController();
    let finishStream!: () => void;
    const streamFinished = new Promise<void>((resolve) => { finishStream = resolve; });
    const cancelledRun = {
      id: "child",
      status: "cancelled" as const,
      createdAt: 1,
      sessionId: "session",
      resourceId: "resource",
      threadId: "thread",
      binding: { backend: "mastra" as const, adapterVersion: "test", nativeRunId: "native" },
    };
    const port: AgentRuntimePort = {
      capabilities: vi.fn(),
      generate: vi.fn(),
      stream: vi.fn(async function* () {
        await streamFinished;
        yield* [] as AgentRuntimeEvent[];
      }),
      cancel: vi.fn(async () => {
        finishStream();
        return cancelledRun;
      }),
      getRun: vi.fn(async () => cancelledRun),
    };
    const executor = new MastraWorkflowAgentNodeExecutor({ runtime: port, resolveVersion: () => version });
    const execution = executor.execute(context({ ownerId: "owner-1" }, controller.signal));
    await vi.waitFor(() => expect(port.stream).toHaveBeenCalledOnce());

    controller.abort();

    await expect(execution).rejects.toMatchObject({
      code: "WORKFLOW_AGENT_CANCELLED",
      details: { childRunId: expect.stringMatching(/^agent-child-/), childStatus: "cancelled" },
    });
    expect(port.cancel).toHaveBeenCalledWith({
      runId: expect.stringMatching(/^agent-child-/),
      reason: "parent workflow cancelled",
    });
    expect(port.getRun).toHaveBeenCalledWith(expect.stringMatching(/^agent-child-/));
  });

  it("按发布版本 schema 校验输出并保留 parent/child 错误链", async () => {
    const outputSchema = {
      type: "object",
      properties: { score: { type: "number" } },
      required: ["score"],
      additionalProperties: false,
    } as const;
    const invalidNode: WorkflowIRAgentNode = {
      ...node,
      config: { ...node.config, outputSchema },
    };
    const invalidVersion: AgentVersion = { ...version, outputSchema };
    const port = runtime([{
      id: 1,
      runId: "child",
      at: 1,
      type: "run.final",
      result: {
        id: "child",
        status: "succeeded",
        createdAt: 1,
        sessionId: "session",
        resourceId: "resource",
        threadId: "thread",
        binding: { backend: "mastra", adapterVersion: "test", nativeRunId: "native" },
        text: "{\"score\":\"invalid\"}",
        toolExecutions: [],
      },
    }]);
    const executor = new MastraWorkflowAgentNodeExecutor({ runtime: port, resolveVersion: () => invalidVersion });

    await expect(executor.execute({ ...context(), node: invalidNode })).rejects.toMatchObject({
      code: "WORKFLOW_AGENT_OUTPUT_SCHEMA_INVALID",
      details: {
        parentNodeId: "agent-node",
        childRunId: expect.stringMatching(/^agent-child-/),
        agentVersionId: "agent-v1",
        schemaDiagnostics: [expect.objectContaining({
          code: "compile.schema",
          location: { kind: "field", nodeId: "agent-node", fieldPath: ["output", "score"] },
        })],
      },
    });
  });

  it("Agent 失败终态转换为保留 parent/child/version 的结构化错误", async () => {
    const port = runtime([{
      id: 1,
      runId: "child",
      at: 1,
      type: "run.final",
      result: {
        id: "child",
        status: "failed",
        createdAt: 1,
        sessionId: "session",
        resourceId: "resource",
        threadId: "thread",
        binding: { backend: "mastra", adapterVersion: "test", nativeRunId: "native" },
        text: "",
        toolExecutions: [],
        error: { code: "MODEL_FAILED", message: "model failed" },
      },
    }]);
    const executor = new MastraWorkflowAgentNodeExecutor({ runtime: port, resolveVersion: () => version });

    await expect(executor.execute(context())).rejects.toMatchObject({
      code: "WORKFLOW_AGENT_FAILED",
      message: "model failed",
      details: {
        parentNodeId: "agent-node",
        childRunId: expect.stringMatching(/^agent-child-/),
        agentVersionId: "agent-v1",
      },
    });
  });
});
