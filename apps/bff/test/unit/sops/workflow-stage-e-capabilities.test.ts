import {
  DEFAULT_WORKFLOW_STAGE_E_CAPABILITIES,
  type WorkflowStageECapabilityRegistry,
} from "@orbit/workflow-core";
import { describe, expect, it } from "vitest";
import { resolveWorkflowStageECapabilities } from "../../../src/sops/workflow-stage-e-capabilities.js";

describe("resolveWorkflowStageECapabilities", () => {
  it("默认开放六项已验证能力，并保持 Parallel/Merge 关闭", () => {
    expect(resolveWorkflowStageECapabilities()).toEqual({
      parallelMerge: false,
      iteration: true,
      boundedLoop: true,
      nestedWorkflow: true,
      agentNode: true,
      humanApproval: true,
      restartResume: true,
    });
    expect(resolveWorkflowStageECapabilities()).toEqual(DEFAULT_WORKFLOW_STAGE_E_CAPABILITIES);
  });

  it("允许调用方进一步关闭单项能力", () => {
    const resolved = resolveWorkflowStageECapabilities({
      iteration: false,
      humanApproval: false,
    } satisfies Partial<WorkflowStageECapabilityRegistry>);

    expect(resolved).toMatchObject({
      parallelMerge: false,
      iteration: false,
      boundedLoop: true,
      humanApproval: false,
      restartResume: true,
    });
  });
});
