import { Body, Controller, Get, Inject, Param, Post, Req, Res } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentRuntimePort } from "@orbit/runtime-contracts";
import type { AgentService } from "../../service-api/index.js";
import { AGENT_RUNTIME_PORT, AGENT_SERVICE } from "../tokens.js";
import { writeJson, writeSseEvent } from "../http.js";
import { OrbitShutdownService } from "../orbit-shutdown.service.js";

type ChatRequest = {
  session_id?: string;
  message?: string;
  agent?: unknown;
  include_scheduled_notifications?: boolean;
};

@Controller()
export class AgentController {
  constructor(
    @Inject(AGENT_SERVICE) private readonly service: AgentService,
    @Inject(AGENT_RUNTIME_PORT) private readonly runtime: AgentRuntimePort,
    @Inject(OrbitShutdownService) private readonly shutdown: OrbitShutdownService,
  ) {}

  @Post("chat")
  async generate(@Body() body: ChatRequest, @Res() res: ServerResponse): Promise<void> {
    const result = await this.service.chat(body, {}, this.runtime);
    writeJson(res, result.ok === false ? 400 : 200, result);
  }

  @Post("chat/stream")
  async stream(
    @Body() body: ChatRequest,
    @Req() req: IncomingMessage,
    @Res() res: ServerResponse,
  ): Promise<void> {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const unregisterSse = this.shutdown.registerSseClient(res);
    writeSseEvent(res, { event: "message.start", data: { session_id: body.session_id } });
    let closed = false;
    req.once("close", () => {
      closed = true;
    });
    try {
      const result = await this.service.chat(body, {
        onAssistantDelta: async (delta) => {
          if (closed) return;
          if (!res.write(`event: message.delta\ndata: ${JSON.stringify({ delta })}\n\n`)) {
            await new Promise<void>((resolve) => res.once("drain", resolve));
          }
        },
      }, this.runtime);
      if (closed) return;
      if (result.ok === false) {
        const error = result.error as { code?: unknown; message?: unknown } | undefined;
        writeSseEvent(res, {
          event: "message.error",
          data: {
            code: String(error?.code ?? "CHAT_STREAM_FAILED"),
            message: String(error?.message ?? "chat stream failed"),
            session: result.session,
          },
        });
        res.end();
        return;
      }
      writeSseEvent(res, {
        event: "message.done",
        data: { ok: true, assistant: result.assistant, session: result.session },
      });
      res.end();
    } finally {
      unregisterSse();
    }
  }

  @Get("agent-runs/:runId")
  async getRun(@Param("runId") runId: string, @Res() res: ServerResponse): Promise<void> {
    const run = await this.runtime.getRun(runId);
    writeJson(res, run ? 200 : 404, run
      ? { ok: true, run }
      : { ok: false, error: { code: "AGENT_RUN_NOT_FOUND", message: `agent run not found: ${runId}` } });
  }

  @Post("agent-runs/:runId/cancel")
  async cancelRun(@Param("runId") runId: string, @Res() res: ServerResponse): Promise<void> {
    const run = await this.runtime.cancel({ runId });
    writeJson(res, 202, { ok: true, run });
  }
}
