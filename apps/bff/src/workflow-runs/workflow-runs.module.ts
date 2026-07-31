import { Module, type DynamicModule } from "@nestjs/common";
import { AgentProxyService, type AgentProxyOptions } from "../agent-proxy.service.js";
import { SqliteAgentVersionRepository } from "../agents/sqlite-agent-version.repository.js";
import { SopDatabase } from "../sops/sop-database.js";
import { SqliteSopsRepository } from "../sops/sqlite-sops.repository.js";
import { SqliteWorkflowRunsRepository } from "./sqlite-workflow-runs.repository.js";
import { WorkflowRunsController } from "./workflow-runs.controller.js";
import { WorkflowRunsService } from "./workflow-runs.service.js";

/** 独立 workflow-runs 领域模块，共享 SOP SQLite 但不执行节点。 */
@Module({})
export class WorkflowRunsModule {
  static register(
    options: AgentProxyOptions,
    database: SopDatabase,
    agentVersions: SqliteAgentVersionRepository,
  ): DynamicModule {
    return {
      module: WorkflowRunsModule,
      controllers: [WorkflowRunsController],
      providers: [
        { provide: AgentProxyService, useValue: new AgentProxyService(options) },
        { provide: SopDatabase, useValue: database },
        { provide: SqliteAgentVersionRepository, useValue: agentVersions },
        SqliteSopsRepository,
        SqliteWorkflowRunsRepository,
        WorkflowRunsService,
      ],
      exports: [WorkflowRunsService],
    };
  }
}
