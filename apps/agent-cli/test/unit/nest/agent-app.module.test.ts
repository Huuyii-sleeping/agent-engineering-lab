import { Mastra } from "@mastra/core/mastra";
import type { DynamicModule, Type } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AgentAppModule } from "../../../src/nest/agent-app.module.js";
import type { AgentService } from "../../../src/service-api/index.js";

function moduleName(input: DynamicModule | Type<unknown>): string {
  return typeof input === "function" ? input.name : input.module.name;
}

describe("nest/agent-app.module", () => {
  it("keeps domain modules explicit and imports MastraModule last", () => {
    const runtimeGateway = { agent: {}, workflow: {}, tools: {}, memory: {} };
    const definition = AgentAppModule.register({
      service: { runtimeGateway } as unknown as AgentService,
      mastra: new Mastra({}),
      cleanupMastra: async () => undefined,
    });
    const names = definition.imports?.map((item) => moduleName(item as DynamicModule | Type<unknown>));

    expect(names).toEqual([
      "RuntimeGatewayModule",
      "AgentRuntimeModule",
      "WorkflowRuntimeModule",
      "ToolExecutionModule",
      "MemoryRuntimeModule",
      "SessionsModule",
      "SkillsModule",
      "SecurityModule",
      "AuditModule",
      "EventsHealthModule",
      "McpModule",
      "MastraModule",
    ]);
  });
});
