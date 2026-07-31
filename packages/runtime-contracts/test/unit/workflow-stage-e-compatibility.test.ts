import { describe, expect, it } from "vitest";
import type { WorkflowRuntimeCapabilities } from "../../src/workflow.js";

const baseCapabilities = {
  start: true,
  query: true,
  cancel: true,
  events: true,
  eventReplay: true,
  resume: true,
  snapshots: true,
  restartRecovery: true,
} satisfies WorkflowRuntimeCapabilities;

describe("WorkflowRuntimeCapabilities stage E compatibility", () => {
  it("允许旧 Port 缺省 stageE，并允许新 Port 返回固定七项矩阵", () => {
    const legacy: WorkflowRuntimeCapabilities = baseCapabilities;
    const stageE: WorkflowRuntimeCapabilities = {
      ...baseCapabilities,
      stageE: {
        parallelMerge: false,
        iteration: true,
        boundedLoop: true,
        nestedWorkflow: true,
        agentNode: true,
        humanApproval: true,
        restartResume: true,
      },
    };

    expect(legacy.stageE).toBeUndefined();
    expect(stageE.stageE).toEqual({
      parallelMerge: false,
      iteration: true,
      boundedLoop: true,
      nestedWorkflow: true,
      agentNode: true,
      humanApproval: true,
      restartResume: true,
    });
  });
});
