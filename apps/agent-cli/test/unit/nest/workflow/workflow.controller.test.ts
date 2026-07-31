import type { ServerResponse } from "node:http";
import { RuntimePortError, type WorkflowRuntimePort } from "@orbit/runtime-contracts";
import { describe, expect, it, vi } from "vitest";
import { WorkflowController } from "../../../../src/nest/workflow/workflow.controller.js";
import type { OrbitShutdownService } from "../../../../src/nest/orbit-shutdown.service.js";

function response() {
  let body = "";
  const res = {
    statusCode: 0,
    setHeader: vi.fn(),
    end: vi.fn((value?: string) => { body = value ?? ""; }),
  } as unknown as ServerResponse;
  return { res, body: () => JSON.parse(body) as Record<string, unknown> };
}

describe("WorkflowController", () => {
  it("将 BFF capability 列表映射到稳定 WorkflowRuntimePort command", async () => {
    const run = {
      id: "run-1",
      workflowId: "workflow-1",
      mode: "draft" as const,
      status: "running" as const,
      createdAt: 1,
      inputs: {},
      nodeRuns: {},
    };
    const runtime = { start: vi.fn(async () => run) } as unknown as WorkflowRuntimePort;
    const controller = new WorkflowController(runtime, {} as OrbitShutdownService);
    const output = response();

    await controller.start({
      workflow: { id: "workflow-1" },
      mode: "draft",
      required_runtime_capabilities: ["iteration", "restartResume"],
    }, output.res);

    expect(runtime.start).toHaveBeenCalledWith(expect.objectContaining({
      requiredRuntimeCapabilities: ["iteration", "restartResume"],
    }));
    expect(output.res.statusCode).toBe(201);
  });

  it("将 run-scoped interrupt snake_case resume 请求映射到 WorkflowRuntimePort", async () => {
    const run = {
      id: "run-1",
      workflowId: "workflow-1",
      mode: "production" as const,
      status: "succeeded" as const,
      createdAt: 1,
      inputs: {},
      nodeRuns: {},
    };
    const runtime = { resume: vi.fn(async () => run) } as unknown as WorkflowRuntimePort;
    const controller = new WorkflowController(runtime, {} as OrbitShutdownService);
    const output = response();
    await controller.resume("run-1", {
      step_id: "approval",
      resume_data: { interruptId: "interrupt-1", approvalRequestId: "interrupt-1", action: "approve", data: {} },
      interrupt: {
        interrupt_id: "interrupt-1",
        action: "approve",
        idempotency_key: "decision-1",
      },
    }, output.res);

    expect(runtime.resume).toHaveBeenCalledWith({
      runId: "run-1",
      stepId: "approval",
      resumeData: { interruptId: "interrupt-1", approvalRequestId: "interrupt-1", action: "approve", data: {} },
      forEachIndex: undefined,
      interrupt: {
        interruptId: "interrupt-1",
        action: "approve",
        idempotencyKey: "decision-1",
      },
    });
    expect(output.res.statusCode).toBe(200);
    expect(output.body()).toMatchObject({ ok: true, run: { id: "run-1", status: "succeeded" } });
  });

  it("保持终态取消和恢复冲突的既有错误 shape", async () => {
    const terminalRun = {
      id: "run-1",
      workflowId: "workflow-1",
      mode: "production" as const,
      status: "succeeded" as const,
      createdAt: 1,
      inputs: {},
      nodeRuns: {},
    };
    const runtime = {
      get: vi.fn(async () => terminalRun),
      cancel: vi.fn(),
      resume: vi.fn(async () => {
        throw new RuntimePortError("RUNTIME_TERMINAL_CONFLICT", "run is terminal");
      }),
    } as unknown as WorkflowRuntimePort;
    const controller = new WorkflowController(runtime, {} as OrbitShutdownService);

    const cancelOutput = response();
    await controller.cancel("run-1", cancelOutput.res);
    expect(cancelOutput.res.statusCode).toBe(409);
    expect(cancelOutput.body()).toMatchObject({
      ok: false,
      error: { code: "WORKFLOW_RUN_TERMINAL" },
      run: { id: "run-1", status: "succeeded" },
    });
    expect(runtime.cancel).not.toHaveBeenCalled();

    const resumeOutput = response();
    await controller.resume("run-1", { resume_data: {} }, resumeOutput.res);
    expect(resumeOutput.res.statusCode).toBe(409);
    expect(resumeOutput.body()).toMatchObject({
      ok: false,
      error: { code: "WORKFLOW_RUN_RESUME_CONFLICT", message: "run is terminal" },
    });
  });
});
