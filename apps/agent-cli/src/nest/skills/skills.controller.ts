import { Body, Controller, Inject, Post, Res } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import type { AgentService } from "../../service-api/index.js";
import { writeJson } from "../http.js";
import { AGENT_SERVICE } from "../tokens.js";

@Controller("skills")
export class SkillsController {
  constructor(@Inject(AGENT_SERVICE) private readonly service: AgentService) {}

  @Post("resolve")
  resolve(@Body() body: { agent?: unknown }, @Res() res: ServerResponse): void {
    const result = this.service.resolveAgentSkills(body.agent);
    writeJson(res, result.ok === false ? 400 : 200, result);
  }
}
