import { Module } from "@nestjs/common";
import { AGENT_MCP_SERVICE, AGENT_SERVICE } from "../tokens.js";

@Module({
  providers: [{ provide: AGENT_MCP_SERVICE, useExisting: AGENT_SERVICE }],
  exports: [AGENT_MCP_SERVICE],
})
export class McpModule {}
