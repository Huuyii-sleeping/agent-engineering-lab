import { Module, type DynamicModule } from "@nestjs/common";
import type { WorkflowStageECapabilityRegistry } from "@orbit/workflow-core";
import { SqliteAgentVersionRepository } from "../agents/sqlite-agent-version.repository.js";
import { SopDatabase, type SopDatabaseOptions } from "./sop-database.js";
import { SopTemplatesController } from "./sop-templates.controller.js";
import { SopsController } from "./sops.controller.js";
import { SopsService } from "./sops.service.js";
import { SqliteSopsRepository } from "./sqlite-sops.repository.js";
import {
  resolveWorkflowStageECapabilities,
  WORKFLOW_STAGE_E_CAPABILITY_REGISTRY,
} from "./workflow-stage-e-capabilities.js";

export type SopsModuleOptions = SopDatabaseOptions & {
  workflowStageECapabilities?: Partial<WorkflowStageECapabilityRegistry>;
};

/** 独立 SOP 领域模块，封装 SQLite、repository、service 和薄 controller。 */
@Module({})
export class SopsModule {
  static register(
    options: SopsModuleOptions,
    database = new SopDatabase(options),
    agentVersions = new SqliteAgentVersionRepository(database),
  ): DynamicModule {
    return {
      module: SopsModule,
      controllers: [SopsController, SopTemplatesController],
      providers: [
        { provide: SopDatabase, useValue: database },
        { provide: SqliteAgentVersionRepository, useValue: agentVersions },
        {
          provide: WORKFLOW_STAGE_E_CAPABILITY_REGISTRY,
          useValue: resolveWorkflowStageECapabilities(options.workflowStageECapabilities),
        },
        SqliteSopsRepository,
        SopsService,
      ],
      exports: [SopsService, SopDatabase],
    };
  }
}
