import { All, Body, Controller, Get, Inject, Param, Post, Put, Patch, Req, Res } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AgentProxyService } from "./agent-proxy.service.js";
import { ProfileService } from "./profile.service.js";
import { SettingsService } from "./settings.service.js";
import { errorPayload, writeJson, type JsonObject } from "./http-utils.js";

function writeProxyResult(res: ServerResponse, result: { status: number; body: unknown }): void {
  writeJson(res, result.status, result.body);
}

function searchFromReq(req: IncomingMessage): string {
  const url = req.url ? new URL(req.url, "http://127.0.0.1") : null;
  return url?.search ?? "";
}

@Controller("/api")
export class AppController {
  constructor(
    @Inject(AgentProxyService)
    private readonly agentProxy: AgentProxyService,
    @Inject(ProfileService)
    private readonly profileService: ProfileService,
    @Inject(SettingsService)
    private readonly settingsService: SettingsService,
  ) {}

  @Get("health")
  async health(@Res() res: ServerResponse): Promise<void> {
    const result = await this.agentProxy.health();
    if (!result.ok) {
      writeProxyResult(res, result);
      return;
    }
    const body = result.body && typeof result.body === "object" && !Array.isArray(result.body) ? (result.body as JsonObject) : {};
    writeJson(res, result.status, {
      ok: body.ok !== false,
      bff: { status: "ok" },
      agent: result.body,
    });
  }

  @Get("profile")
  async profile(@Res() res: ServerResponse): Promise<void> {
    writeJson(res, 200, { ok: true, profile: await this.profileService.getProfile() });
  }

  @Put("profile")
  async updateProfile(@Body() body: unknown, @Res() res: ServerResponse): Promise<void> {
    writeJson(res, 200, { ok: true, profile: await this.profileService.updateProfile(body) });
  }

  @Get("settings")
  async settings(@Res() res: ServerResponse): Promise<void> {
    writeJson(res, 200, { ok: true, settings: await this.settingsService.getSettings() });
  }

  @Patch("settings")
  async patchSettings(@Body() body: unknown, @Res() res: ServerResponse): Promise<void> {
    writeJson(res, 200, { ok: true, settings: await this.settingsService.patchSettings(body) });
  }

  @Get("sessions")
  async sessions(@Res() res: ServerResponse): Promise<void> {
    writeProxyResult(res, await this.agentProxy.sessions());
  }

  @Post("sessions")
  async createSession(@Body() body: JsonObject, @Res() res: ServerResponse): Promise<void> {
    writeProxyResult(res, await this.agentProxy.createSession(body));
  }

  @Get("sessions/:sessionId/transcript")
  async transcript(@Param("sessionId") sessionId: string, @Res() res: ServerResponse): Promise<void> {
    writeProxyResult(res, await this.agentProxy.transcript(sessionId));
  }

  @Post("sessions/:sessionId/messages")
  async sendMessage(
    @Param("sessionId") sessionId: string,
    @Body() body: JsonObject,
    @Res() res: ServerResponse,
  ): Promise<void> {
    writeProxyResult(res, await this.agentProxy.sendMessage(sessionId, body));
  }

  @Post("sessions/:sessionId/messages/stream")
  async streamMessage(
    @Param("sessionId") sessionId: string,
    @Body() body: JsonObject,
    @Res() res: ServerResponse,
  ): Promise<void> {
    await this.agentProxy.proxyChatMessageStream(res, sessionId, body);
  }

  @Get("sessions/:sessionId")
  async sessionDetail(@Param("sessionId") sessionId: string, @Res() res: ServerResponse): Promise<void> {
    writeProxyResult(res, await this.agentProxy.sessionDetail(sessionId));
  }

  @Get("audit/events")
  async auditEvents(@Req() req: IncomingMessage, @Res() res: ServerResponse): Promise<void> {
    writeProxyResult(res, await this.agentProxy.auditEvents(searchFromReq(req)));
  }

  @Get("security/findings")
  async securityFindings(@Req() req: IncomingMessage, @Res() res: ServerResponse): Promise<void> {
    writeProxyResult(res, await this.agentProxy.securityFindings(searchFromReq(req)));
  }

  @Get("events/stream")
  async events(@Req() req: IncomingMessage, @Res() res: ServerResponse): Promise<void> {
    await this.agentProxy.proxyEventStream(req, res, searchFromReq(req));
  }

  @All("*")
  notFound(@Req() req: IncomingMessage, @Res() res: ServerResponse): void {
    writeJson(res, 404, errorPayload("NOT_FOUND", `${req.method ?? "GET"} ${req.url ?? "/"} is not implemented`));
  }
}
