import { Body, Controller, Get, Inject, Post, Res } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { RuntimePortError, type ToolExecutionPort } from "@orbit/runtime-contracts";
import type { AgentService } from "../../service-api/index.js";
import { writeJson } from "../http.js";
import { AGENT_SERVICE, TOOL_EXECUTION_PORT } from "../tokens.js";

@Controller("tools")
export class ToolController {
  constructor(
    @Inject(AGENT_SERVICE) private readonly service: AgentService,
    @Inject(TOOL_EXECUTION_PORT) private readonly runtime: ToolExecutionPort,
  ) {}

  @Get()
  async list(): Promise<Record<string, unknown>> {
    return { ok: true, tools: await this.service.toolsMetadata() };
  }

  @Post("call")
  async execute(
    @Body() body: { name?: string; arguments_json?: string },
    @Res() res: ServerResponse,
  ): Promise<void> {
    const toolName = String(body.name ?? "").trim();
    if (!toolName) {
      writeJson(res, 400, {
        ok: false,
        error: { code: "INVALID_REQUEST", message: "tool name is required" },
      });
      return;
    }
    const argumentsJson = String(body.arguments_json ?? "");
    let input: unknown = {};
    try {
      input = JSON.parse(argumentsJson || "{}") as unknown;
    } catch {
      input = {};
    }
    try {
      const result = await this.runtime.execute({
        toolId: toolName,
        input,
        ownerId: "local-direct-api",
        executor: { kind: "direct" },
        requestContext: { argumentsJson },
      });
      const output = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
      writeJson(res, 200, { ok: true, output });
    } catch (error) {
      if (error instanceof RuntimePortError && typeof error.details.rawOutput === "string") {
        writeJson(res, 200, { ok: true, output: error.details.rawOutput });
        return;
      }
      throw error;
    }
  }
}
