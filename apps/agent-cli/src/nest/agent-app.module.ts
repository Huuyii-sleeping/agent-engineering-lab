import { DynamicModule, Module } from "@nestjs/common";
import type { Mastra } from "@mastra/core/mastra";
import { MastraModule } from "@mastra/nestjs";
import type { AgentService } from "../service-api/index.js";
import { AgentRuntimeModule } from "./agent/agent.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { EventsHealthModule } from "./events-health/events-health.module.js";
import { MastraRuntimeLifecycle } from "./mastra-runtime-lifecycle.js";
import { McpModule } from "./mcp/mcp.module.js";
import { MemoryRuntimeModule } from "./memory/memory.module.js";
import { RuntimeGatewayModule } from "./runtime-gateway.module.js";
import { SecurityModule } from "./security/security.module.js";
import { SessionsModule } from "./sessions/sessions.module.js";
import { SkillsModule } from "./skills/skills.module.js";
import { ToolExecutionModule } from "./tool/tool.module.js";
import { MASTRA_RUNTIME_CLEANUP } from "./tokens.js";
import { WorkflowRuntimeModule } from "./workflow/workflow.module.js";

export type AgentAppModuleOptions = {
  service: AgentService;
  mastra: Mastra;
  cleanupMastra: () => Promise<void>;
};

@Module({})
export class AgentAppModule {
  /** 构建单一 Agent Service；MastraModule 必须保持为最后一个 import。 */
  static register(options: AgentAppModuleOptions): DynamicModule {
    return {
      module: AgentAppModule,
      imports: [
        RuntimeGatewayModule.register(options.service),
        AgentRuntimeModule,
        WorkflowRuntimeModule,
        ToolExecutionModule,
        MemoryRuntimeModule,
        SessionsModule,
        SkillsModule,
        SecurityModule,
        AuditModule,
        EventsHealthModule,
        McpModule,
        MastraModule.register({
          mastra: options.mastra,
          prefix: "/internal/mastra",
          shutdownOptions: { timeoutMs: 30_000, notifyClients: true },
          streamOptions: { redact: true },
        }),
      ],
      providers: [
        { provide: MASTRA_RUNTIME_CLEANUP, useValue: options.cleanupMastra },
        MastraRuntimeLifecycle,
      ],
    };
  }
}
