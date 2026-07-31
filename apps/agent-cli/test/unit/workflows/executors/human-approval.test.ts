import { describe, expect, it } from "vitest";
import type { WorkflowIRHumanApprovalNode } from "@orbit/workflow-core";
import { HumanApprovalWorkflowExecutor } from "../../../../src/workflows/executors/human-approval.js";
import { WorkflowVariableContext } from "../../../../src/workflows/context.js";

function node(timeoutPolicy: WorkflowIRHumanApprovalNode["suspend"]["timeoutPolicy"] = "fail"): WorkflowIRHumanApprovalNode {
  return {
    id: "approval-node",
    type: "human-approval",
    nodeVersion: 1,
    label: "人工审批",
    disabled: false,
    config: {
      policyId: "policy-1",
      displayFields: [],
      decisionSchema: { type: "object" },
      deadlineMs: 5_000,
      timeoutPolicy,
    },
    ports: {
      inputs: [{ id: "in", name: "输入", direction: "input", dataType: "object" }],
      outputs: [
        { id: "approved", name: "已批准", direction: "output", dataType: "object" },
        { id: "rejected", name: "已拒绝", direction: "output", dataType: "object" },
        { id: "error", name: "审批异常", direction: "output", dataType: "object" },
      ],
    },
    executor: { id: "workflow.human-approval", version: 1 },
    execution: { timeoutMs: 10_000, maxAttempts: 1, retryBackoffMs: 0, idempotent: true, onError: "fail" },
    kind: "human-approval",
    suspend: {
      policyId: "policy-1",
      displayFields: [
        { id: "title", label: "标题", value: { kind: "literal", value: "发布" } },
        { id: "apiToken", label: "API Token", value: { kind: "variable", ref: { scope: "workflow-input", inputId: "token" } } },
      ],
      decisionSchema: { type: "object" },
      deadlineMs: 5_000,
      timeoutPolicy,
    },
  };
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-1",
    nativeRunId: "native-1",
    workflowId: "workflow-1",
    workflowVersionId: "workflow-v1",
    node: node(),
    nodeInstanceId: "approval-instance-1",
    attempt: 1,
    inputs: {},
    variables: new WorkflowVariableContext({ inputs: { token: "secret-value" } }),
    signal: new AbortController().signal,
    emitLog: () => {},
    emitDelta: () => {},
    ...overrides,
  };
}

describe("HumanApprovalWorkflowExecutor", () => {
  it("直接返回 run-scoped Mastra interrupt payload，不依赖审批控制面", async () => {
    const executor = new HumanApprovalWorkflowExecutor({ now: () => 1_000 });
    const result = await executor.execute(context());

    expect(result).toMatchObject({
      outputs: {},
      suspend: {
        reason: "Human approval pending",
        payload: {
          kind: "approval",
          interruptId: expect.stringMatching(/^interrupt_/),
          approvalRequestId: expect.stringMatching(/^interrupt_/),
          deadline: 6_000,
          displayFields: [
            { id: "title", label: "标题", value: "发布" },
            { id: "apiToken", label: "API Token", value: "[REDACTED]" },
          ],
          decisionSchema: { type: "object" },
          timeoutPolicy: "fail",
        },
      },
    });
    expect(JSON.stringify(result.suspend?.payload)).not.toMatch(/secret-value|resumeToken|checkpoint/);
  });

  it.each([
    ["approve", "approved"],
    ["reject", "rejected"],
  ] as const)("将 %s 决定映射到 %s 端口", async (action, portId) => {
    const executor = new HumanApprovalWorkflowExecutor();
    await expect(executor.execute(context({
      resumeData: { interruptId: "interrupt-1", approvalRequestId: "interrupt-1", action, data: { comment: "ok" } },
    }))).resolves.toMatchObject({
      selectedPortIds: [portId],
      outputs: { [portId]: { interruptId: "interrupt-1", action, data: { comment: "ok" } } },
    });
  });

  it("按 timeoutPolicy 将超时稳定路由或失败", async () => {
    const rejectExecutor = new HumanApprovalWorkflowExecutor();
    await expect(rejectExecutor.execute(context({
      node: node("reject"),
      resumeData: { interruptId: "interrupt-1", action: "timeout", data: {} },
    }))).resolves.toMatchObject({ selectedPortIds: ["rejected"] });

    const errorExecutor = new HumanApprovalWorkflowExecutor();
    await expect(errorExecutor.execute(context({
      node: node("error-route"),
      resumeData: { interruptId: "interrupt-1", action: "timeout", data: {} },
    }))).resolves.toMatchObject({ selectedPortIds: ["error"] });

    await expect(errorExecutor.execute(context({
      node: node("fail"),
      resumeData: { interruptId: "interrupt-1", action: "timeout", data: {} },
    }))).rejects.toMatchObject({ code: "APPROVAL_TIMEOUT" });
  });
});
