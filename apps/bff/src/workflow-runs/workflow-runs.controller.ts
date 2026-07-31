import { Body, Controller, Get, Inject, Param, Post, Req, Res } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { errorPayload, writeJson } from "../http-utils.js";
import { WorkflowRunControlError } from "./workflow-runs.errors.js";
import { WorkflowRunsService } from "./workflow-runs.service.js";
import type { ResumeWorkflowRunInput, StartWorkflowRunInput } from "./workflow-runs.types.js";

async function respond(res: ServerResponse, statusCode: number, action: () => Promise<unknown>): Promise<void> {
  try {
    writeJson(res, statusCode, { ok: true, data: await action() });
  } catch (error) {
    if (error instanceof WorkflowRunControlError) {
      writeJson(res, error.statusCode, errorPayload(error.code, error.message, error.metadata));
      return;
    }
    writeJson(res, 500, errorPayload("WORKFLOW_RUN_INTERNAL_ERROR", error instanceof Error ? error.message : String(error)));
  }
}

/** 工作流启动、查询、取消和事件流的薄 REST 控制器。 */
@Controller("/api/workflow-runs")
export class WorkflowRunsController {
  constructor(@Inject(WorkflowRunsService) private readonly service: WorkflowRunsService) {}

  @Post()
  start(@Body() body: StartWorkflowRunInput, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 201, () => this.service.start(body));
  }

  @Get(":id/events")
  async events(@Param("id") id: string, @Req() req: IncomingMessage, @Res() res: ServerResponse): Promise<void> {
    try {
      await this.service.stream(id, req, res);
    } catch (error) {
      if (error instanceof WorkflowRunControlError) {
        writeJson(res, error.statusCode, errorPayload(error.code, error.message, error.metadata));
        return;
      }
      writeJson(res, 500, errorPayload("WORKFLOW_RUN_INTERNAL_ERROR", error instanceof Error ? error.message : String(error)));
    }
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 202, () => this.service.cancel(id));
  }

  @Post(":id/resume")
  resume(@Param("id") id: string, @Body() body: ResumeWorkflowRunInput, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => this.service.resume(id, body));
  }

  @Get(":id")
  get(@Param("id") id: string, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => this.service.get(id));
  }
}
