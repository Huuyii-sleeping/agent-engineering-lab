import { describe, expect, it } from "vitest";
import { transitionNodeStatus, transitionRunStatus } from "../../../src/workflows/state-machine.js";

describe("workflow state machine", () => {
  it("只允许声明的运行和节点状态转换", () => {
    expect(transitionRunStatus("queued", "running")).toBe("running");
    expect(transitionRunStatus("running", "succeeded")).toBe("succeeded");
    expect(transitionNodeStatus("pending", "ready")).toBe("ready");
    expect(transitionNodeStatus("ready", "running")).toBe("running");
    expect(transitionNodeStatus("running", "failed")).toBe("failed");
  });

  it("拒绝终态回退和非法跳转", () => {
    expect(() => transitionRunStatus("succeeded", "running")).toThrow(/终态|非法/);
    expect(() => transitionRunStatus("queued", "succeeded")).toThrow(/非法/);
    expect(() => transitionNodeStatus("succeeded", "running")).toThrow(/终态|非法/);
    expect(() => transitionNodeStatus("pending", "succeeded")).toThrow(/非法/);
  });
});
