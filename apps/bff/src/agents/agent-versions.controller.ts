import { Controller, Get, Inject, Param, Query, Res } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { errorPayload, writeJson } from "../http-utils.js";
import { AgentVersionNotFoundError, AgentVersionService } from "./agent-version.service.js";

/** AgentVersion 只读 catalog/detail REST 入口。 */
@Controller("/api/agent-versions")
export class AgentVersionsController {
  constructor(@Inject(AgentVersionService) private readonly versions: AgentVersionService) {}

  @Get()
  list(@Query("agentProfileId") agentProfileId: string | undefined, @Res() res: ServerResponse): void {
    writeJson(res, 200, { ok: true, versions: this.versions.list(agentProfileId) });
  }

  @Get(":agentVersionId")
  get(@Param("agentVersionId") agentVersionId: string, @Res() res: ServerResponse): void {
    try {
      writeJson(res, 200, { ok: true, version: this.versions.get(agentVersionId) });
    } catch (error) {
      if (error instanceof AgentVersionNotFoundError) {
        writeJson(res, 404, errorPayload(error.code, error.message));
        return;
      }
      throw error;
    }
  }
}
