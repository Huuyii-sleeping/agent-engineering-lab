import { describe, expect, it } from "vitest";
import { formatInspectorDiagnostic } from "./inspector-diagnostics";

describe("formatInspectorDiagnostic", () => {
  it("展示发布错误的字段和连线定位", () => {
    expect(formatInspectorDiagnostic({ code: "merge.parallel", severity: "error", message: "Parallel 不存在。", location: { kind: "field", nodeId: "merge", fieldPath: ["parallelNodeId"] } })).toBe("字段 parallelNodeId：Parallel 不存在。");
    expect(formatInspectorDiagnostic({ code: "edge.invalid", severity: "error", message: "端口不兼容。", location: { kind: "edge", edgeId: "edge-1" } })).toBe("连线 edge-1：端口不兼容。");
  });
});
