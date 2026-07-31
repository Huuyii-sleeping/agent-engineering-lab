import { Body, Controller, Get, Inject, Param, Post, Res } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import type { AgentService } from "../../service-api/index.js";
import { summarizeSession } from "../../service-api/sessions.js";
import { writeJson } from "../http.js";
import { AGENT_SERVICE } from "../tokens.js";

@Controller("sessions")
export class SessionsController {
  constructor(@Inject(AGENT_SERVICE) private readonly service: AgentService) {}

  @Get()
  list(): Record<string, unknown> {
    return { ok: true, sessions: this.service.listSessions().map((item) => summarizeSession(item)) };
  }

  @Post()
  create(@Body() body: { agent?: unknown }, @Res() res: ServerResponse): void {
    const session = this.service.createSession(body.agent);
    writeJson(res, 201, { ok: true, session: summarizeSession(session) });
  }

  @Get(":sessionId")
  detail(@Param("sessionId") sessionId: string, @Res() res: ServerResponse): void {
    const session = this.service.getSessionDetail(sessionId);
    writeJson(res, session ? 200 : 404, session
      ? { ok: true, session }
      : { ok: false, error: { code: "SESSION_NOT_FOUND", message: `session not found: ${sessionId}` } });
  }
}
