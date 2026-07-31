import { describe, expect, it } from "vitest";
import { builtinNodeRegistry } from "@orbit/workflow-core";
import { appendApprovalDisplayField, clampApprovalDeadlineMs } from "./approval-config";

describe("approval-config", () => {
  it("生成稳定展示字段并限制最长审批期限", () => {
    const config = appendApprovalDisplayField(builtinNodeRegistry.get("human-approval")!.createDefaultConfig(), () => "display-stable");
    expect(config.displayFields[0]).toMatchObject({ id: "display-stable", label: "展示字段 1" });
    expect(clampApprovalDeadlineMs(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampApprovalDeadlineMs(31 * 24 * 60 * 60 * 1_000)).toBe(30 * 24 * 60 * 60 * 1_000);
  });
});
