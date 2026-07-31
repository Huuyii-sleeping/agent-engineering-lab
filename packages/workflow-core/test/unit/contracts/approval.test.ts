import { describe, expect, it } from "vitest";
import type { ApprovalDecisionSchema, ApprovalDisplayValue } from "../../../src/contracts/approval.js";
import { isApprovalDecisionAction } from "../../../src/contracts/approval.js";

describe("contracts/approval", () => {
  it("只定义 run waiting 展示和决定动作，不形成 ApprovalRequest 产品实体", () => {
    const displayFields = [{ id: "summary", label: "摘要", value: "已脱敏内容" }] satisfies ApprovalDisplayValue[];
    const decisionSchema = {
      type: "object",
      properties: { comment: { type: "string" } },
      additionalProperties: false,
    } satisfies ApprovalDecisionSchema;

    expect(displayFields).toEqual([{ id: "summary", label: "摘要", value: "已脱敏内容" }]);
    expect(decisionSchema).toMatchObject({ type: "object" });
    expect(isApprovalDecisionAction("approve")).toBe(true);
    expect(isApprovalDecisionAction("reject")).toBe(true);
    expect(isApprovalDecisionAction("cancel")).toBe(false);
  });
});
