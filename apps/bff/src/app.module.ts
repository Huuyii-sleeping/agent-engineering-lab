import { Module } from "@nestjs/common";
import { AgentProxyService, type AgentProxyOptions } from "./agent-proxy.service.js";
import { AgentsController } from "./agents/agents.controller.js";
import { AgentProfileService } from "./agents/agent-profile.service.js";
import { AppController } from "./app.controller.js";
import { LocalStoreService, type LocalStoreOptions } from "./local-store.service.js";
import { ProfileService } from "./profile.service.js";
import { SettingsService } from "./settings.service.js";
import { SkillInstallerService } from "./skills/skill-installer.service.js";
import { SkillRegistryService, type SkillRegistryOptions } from "./skills/skill-registry.service.js";
import { SkillStoreService } from "./skills/skill-store.service.js";
import { SkillValidatorService } from "./skills/skill-validator.service.js";
import { SkillsController } from "./skills/skills.controller.js";
import { SopsModule } from "./sops/sops.module.js";
import type { SopDatabaseOptions } from "./sops/sop-database.js";
import { SopDatabase } from "./sops/sop-database.js";
import { WorkflowRunsModule } from "./workflow-runs/workflow-runs.module.js";

export type AppModuleOptions = AgentProxyOptions & LocalStoreOptions & SkillRegistryOptions & SopDatabaseOptions;

@Module({})
export class AppModule {
  static register(options: AppModuleOptions) {
    const localStoreService = new LocalStoreService(options);
    const skillValidatorService = new SkillValidatorService();
    const skillStoreService = new SkillStoreService(skillValidatorService, options);
    const skillInstallerService = new SkillInstallerService(localStoreService, skillStoreService, skillValidatorService);
    const sopDatabase = new SopDatabase(options);
    return {
      module: AppModule,
      imports: [SopsModule.register(options, sopDatabase), WorkflowRunsModule.register(options, sopDatabase)],
      controllers: [AgentsController, SkillsController, AppController],
      providers: [
        { provide: AgentProxyService, useValue: new AgentProxyService(options) },
        { provide: LocalStoreService, useValue: localStoreService },
        { provide: SkillValidatorService, useValue: skillValidatorService },
        { provide: SkillStoreService, useValue: skillStoreService },
        { provide: SkillInstallerService, useValue: skillInstallerService },
        { provide: SkillRegistryService, useValue: new SkillRegistryService(localStoreService, skillStoreService, skillInstallerService) },
        AgentProfileService,
        ProfileService,
        SettingsService,
      ],
    };
  }
}
