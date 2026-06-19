import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Res } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { errorPayload, writeJson } from "../http-utils.js";
import { AgentProfileService } from "./agent-profile.service.js";

@Controller("/api/agents")
export class AgentsController {
  constructor(
    @Inject(AgentProfileService)
    private readonly agentProfileService: AgentProfileService,
  ) {}

  /** Lists all user-managed agent profiles. */
  @Get()
  async agents(@Res() res: ServerResponse): Promise<void> {
    writeJson(res, 200, { ok: true, agents: await this.agentProfileService.listAgents() });
  }

  /** Creates a new agent profile from a submitted draft. */
  @Post()
  async createAgent(@Body() body: unknown, @Res() res: ServerResponse): Promise<void> {
    writeJson(res, 201, { ok: true, agent: await this.agentProfileService.createAgent(body) });
  }

  /** Updates a single agent profile by id. */
  @Put(":agentId")
  async updateAgent(
    @Param("agentId") agentId: string,
    @Body() body: unknown,
    @Res() res: ServerResponse,
  ): Promise<void> {
    const agent = await this.agentProfileService.updateAgent(agentId, body);
    if (!agent) {
      writeJson(res, 404, errorPayload("AGENT_NOT_FOUND", `agent ${agentId} was not found`));
      return;
    }
    writeJson(res, 200, { ok: true, agent });
  }

  /** Deletes a single agent profile by id. */
  @Delete(":agentId")
  async deleteAgent(@Param("agentId") agentId: string, @Res() res: ServerResponse): Promise<void> {
    const deleted = await this.agentProfileService.deleteAgent(agentId);
    if (!deleted) {
      writeJson(res, 404, errorPayload("AGENT_NOT_FOUND", `agent ${agentId} was not found`));
      return;
    }
    writeJson(res, 200, { ok: true });
  }
}
