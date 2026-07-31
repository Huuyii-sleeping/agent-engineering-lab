import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  RuntimePortError,
  type ResumeWorkflowRunCommand,
  type StartWorkflowRunCommand,
  type WorkflowRuntimePort,
} from "@orbit/runtime-contracts";
import { isTerminalWorkflowRunStatus } from "@orbit/workflow-core";
import { parseWorkflowEventCursor, writeJson, writeSseEvent } from "../http.js";
import { WORKFLOW_RUNTIME_PORT } from "../tokens.js";
import { OrbitShutdownService } from "../orbit-shutdown.service.js";

type StartWorkflowRequest = {
  workflow: unknown;
  workflow_dependencies?: unknown[];
  agent_dependencies?: unknown[];
  approval_policy_ids?: string[];
  required_runtime_capabilities?: string[];
  mode: StartWorkflowRunCommand["mode"];
  inputs?: Record<string, unknown>;
  target_node_id?: string;
  node_inputs?: Record<string, unknown>;
};

type ResumeWorkflowRequest = {
  step_id?: string;
  resume_data?: Record<string, unknown>;
  for_each_index?: number;
  interrupt?: {
    interrupt_id?: string;
    action?: "approve" | "reject";
    idempotency_key?: string;
  };
};

@Controller("workflow-runs")
export class WorkflowController {
  constructor(
    @Inject(WORKFLOW_RUNTIME_PORT) private readonly runtime: WorkflowRuntimePort,
    @Inject(OrbitShutdownService) private readonly shutdown: OrbitShutdownService,
  ) {}

  @Post()
  async start(@Body() input: StartWorkflowRequest, @Res() res: ServerResponse): Promise<void> {
    try {
      const run = await this.runtime.start({
        workflow: input.workflow as StartWorkflowRunCommand["workflow"],
        workflowDependencies: input.workflow_dependencies as StartWorkflowRunCommand["workflowDependencies"],
        agentDependencies: input.agent_dependencies as StartWorkflowRunCommand["agentDependencies"],
        approvalPolicyIds: input.approval_policy_ids,
        requiredRuntimeCapabilities: input.required_runtime_capabilities,
        mode: input.mode,
        inputs: input.inputs,
        targetNodeId: input.target_node_id,
        nodeInputs: input.node_inputs,
      });
      writeJson(res, 201, { ok: true, run });
    } catch (error) {
      writeJson(res, 400, {
        ok: false,
        error: {
          code: "WORKFLOW_RUN_INVALID",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  @Get(":runId")
  async get(@Param("runId") runId: string, @Res() res: ServerResponse): Promise<void> {
    const run = await this.runtime.get(runId);
    writeJson(res, run ? 200 : 404, run
      ? { ok: true, run }
      : { ok: false, error: { code: "WORKFLOW_RUN_NOT_FOUND", message: `运行 ${runId} 不存在。` } });
  }

  @Post(":runId/cancel")
  async cancel(@Param("runId") runId: string, @Res() res: ServerResponse): Promise<void> {
    const run = await this.runtime.get(runId);
    if (!run) {
      writeJson(res, 404, {
        ok: false,
        error: { code: "WORKFLOW_RUN_NOT_FOUND", message: `运行 ${runId} 不存在。` },
      });
      return;
    }
    if (isTerminalWorkflowRunStatus(run.status)) {
      writeJson(res, 409, {
        ok: false,
        error: { code: "WORKFLOW_RUN_TERMINAL", message: `运行已进入终态 ${run.status}。` },
        run,
      });
      return;
    }
    try {
      await this.runtime.cancel({ runId });
      writeJson(res, 202, { ok: true, run });
    } catch (error) {
      const terminal = error instanceof RuntimePortError && error.code === "RUNTIME_TERMINAL_CONFLICT";
      writeJson(res, terminal ? 409 : 400, {
        ok: false,
        error: {
          code: terminal ? "WORKFLOW_RUN_TERMINAL" : "WORKFLOW_RUN_CANCEL_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
        run,
      });
    }
  }

  @Get(":runId/events")
  async events(
    @Param("runId") runId: string,
    @Query("since_id") sinceId: string | undefined,
    @Headers("last-event-id") lastEventId: string | undefined,
    @Req() req: IncomingMessage,
    @Res() res: ServerResponse,
  ): Promise<void> {
    const run = await this.runtime.get(runId);
    if (!run) {
      writeJson(res, 404, {
        ok: false,
        error: { code: "WORKFLOW_RUN_NOT_FOUND", message: `运行 ${runId} 不存在。` },
      });
      return;
    }
    let cursor: number;
    try {
      cursor = parseWorkflowEventCursor(lastEventId ?? sinceId);
    } catch (error) {
      writeJson(res, 400, {
        ok: false,
        error: { code: "INVALID_CURSOR", message: error instanceof Error ? error.message : String(error) },
      });
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const unregisterSse = this.shutdown.registerSseClient(res);
    const iterator = this.runtime.events({ runId, sinceId: cursor })[Symbol.asyncIterator]();
    let connectionClosed = false;
    const closed = new Promise<"closed">((resolve) => {
      req.once("close", () => {
        connectionClosed = true;
        resolve("closed");
      });
    });
    try {
      while (!connectionClosed) {
        const next = await Promise.race([iterator.next(), closed]);
        if (next === "closed" || next.done) break;
        const event = next.value;
        writeSseEvent(res, { id: event.id, event: event.type, data: event });
        if (event.type === "run.status" && isTerminalWorkflowRunStatus(event.status)) break;
      }
    } finally {
      await iterator.return?.();
      unregisterSse();
    }
    if (!connectionClosed) res.end();
  }

  @Post(":runId/resume")
  async resume(
    @Param("runId") runId: string,
    @Body() input: ResumeWorkflowRequest,
    @Res() res: ServerResponse,
  ): Promise<void> {
    try {
      const interrupt = input.interrupt;
      const run = await this.runtime.resume({
        runId,
        stepId: input.step_id,
        resumeData: input.resume_data ?? {},
        forEachIndex: input.for_each_index,
        ...(interrupt ? {
          interrupt: {
            interruptId: String(interrupt.interrupt_id ?? ""),
            action: interrupt.action as NonNullable<ResumeWorkflowRunCommand["interrupt"]>["action"],
            idempotencyKey: String(interrupt.idempotency_key ?? ""),
          },
        } : {}),
      });
      writeJson(res, 200, { ok: true, run });
    } catch (error) {
      const conflict = error instanceof RuntimePortError
        && (error.code === "RUNTIME_TERMINAL_CONFLICT" || error.code === "RUNTIME_OWNERSHIP_CONFLICT");
      writeJson(res, conflict ? 409 : 400, {
        ok: false,
        error: {
          code: conflict ? "WORKFLOW_RUN_RESUME_CONFLICT" : "WORKFLOW_RUN_RESUME_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
