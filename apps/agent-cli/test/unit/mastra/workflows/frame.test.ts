import { describe, expect, it } from "vitest";
import {
  MASTRA_WORKFLOW_FRAME_SCHEMA,
  createMastraWorkflowFrame,
  withMastraWorkflowExecutionIdentity,
} from "../../../../src/mastra/workflows/frame.js";

describe("MastraWorkflowFrame", () => {
  it("保存框架无关的容器、实例和 child run identity", () => {
    const frame = createMastraWorkflowFrame({
      productRunId: "run-1",
      containerId: "iteration-1",
      instanceId: "instance-3",
      iterationIndex: 3,
      executionPath: ["root", "iteration-1", "instance-3"],
      childRunId: "child-1",
    });

    expect(MASTRA_WORKFLOW_FRAME_SCHEMA.parse(frame)).toMatchObject({
      containerId: "iteration-1",
      instanceId: "instance-3",
      iterationIndex: 3,
      executionPath: ["root", "iteration-1", "instance-3"],
      childRunId: "child-1",
    });
  });

  it("默认根 frame 使用空 executionPath，并可原子派生实例 identity", () => {
    const root = createMastraWorkflowFrame({ productRunId: "run-1" });
    const child = withMastraWorkflowExecutionIdentity(root, {
      containerId: "iteration-1",
      instanceId: "instance-0",
      iterationIndex: 0,
      executionPath: ["root", "iteration-1", "instance-0"],
    });

    expect(root.executionPath).toEqual([]);
    expect(child).toMatchObject({
      productRunId: "run-1",
      containerId: "iteration-1",
      instanceId: "instance-0",
      iterationIndex: 0,
      executionPath: ["root", "iteration-1", "instance-0"],
    });
    expect(root).not.toHaveProperty("containerId");
  });
});
