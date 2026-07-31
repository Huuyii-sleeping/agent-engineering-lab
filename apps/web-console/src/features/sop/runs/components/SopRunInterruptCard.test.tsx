import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowRunSnapshot } from "@orbit/workflow-core";
import {
  collectInterruptDecisionData,
  SopRunInterruptCard,
} from "./SopRunInterruptCard";

function waitingRun(): WorkflowRunSnapshot {
  return {
    id: "run-current",
    workflowId: "workflow-1",
    mode: "draft",
    status: "waiting",
    createdAt: 1,
    inputs: {},
    nodeRuns: {},
    waiting: {
      nodeId: "approval-node",
      reason: "Human approval pending",
      waiting: {
        kind: "approval",
        interruptId: "interrupt-current",
        approvalRequestId: "interrupt-current",
        deadline: Date.UTC(2030, 0, 1),
        displayFields: [{ id: "summary", label: "变更摘要", value: "发布 Agent v2" }],
        decisionSchema: {
          type: "object",
          properties: {
            comment: { type: "string", title: "审批意见" },
            risk: { type: "integer", title: "风险等级", minimum: 1, maximum: 5 },
          },
          required: ["comment"],
          additionalProperties: false,
        },
      },
    },
  };
}

describe("SopRunInterruptCard", () => {
  it("只为当前 waiting run 渲染上下文化 interrupt 卡片", () => {
    const run = waitingRun();
    const markup = renderToStaticMarkup(
      <SopRunInterruptCard run={run} decisionPending={false} onResume={vi.fn()} />,
    );

    expect(markup).toContain("当前运行已暂停");
    expect(markup).toContain("run-current");
    expect(markup).toContain("interrupt-current");
    expect(markup).toContain("发布 Agent v2");
    expect(markup).toContain("同意并继续");
    expect(markup).toContain("拒绝并继续");
    expect(markup).not.toContain("审批收件箱");

    expect(renderToStaticMarkup(
      <SopRunInterruptCard run={{ ...run, status: "running", waiting: undefined }} decisionPending={false} onResume={vi.fn()} />,
    )).toBe("");
  });

  it("按 decisionSchema 解析结构化表单并拒绝缺失必填或错误类型", () => {
    const schema = waitingRun().waiting!.waiting!.decisionSchema;

    expect(collectInterruptDecisionData(schema, { comment: "同意发布", risk: "3" })).toEqual({
      comment: "同意发布",
      risk: 3,
    });
    expect(() => collectInterruptDecisionData(schema, { risk: "3" })).toThrow("comment");
    expect(() => collectInterruptDecisionData(schema, { comment: "同意", risk: "high" })).toThrow("risk");
  });
});
