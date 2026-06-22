import { Module } from "@nestjs/common";
import { AgentProxyService, type AgentProxyOptions } from "./agent-proxy.service.js";
import { AgentsController } from "./agents/agents.controller.js";
import { AgentProfileService } from "./agents/agent-profile.service.js";
import { AppController } from "./app.controller.js";
import { LocalStoreService, type LocalStoreOptions } from "./local-store.service.js";
import { ProfileService } from "./profile.service.js";
import { SettingsService } from "./settings.service.js";
import { SkillRegistryService, type SkillRegistryOptions } from "./skills/skill-registry.service.js";
import { SkillsController } from "./skills/skills.controller.js";

export type AppModuleOptions = AgentProxyOptions & LocalStoreOptions & SkillRegistryOptions;

@Module({})
export class AppModule {
  static register(options: AppModuleOptions) {
    const localStoreService = new LocalStoreService(options);
    return {
      module: AppModule,
      controllers: [AgentsController, SkillsController, AppController],
      providers: [
        { provide: AgentProxyService, useValue: new AgentProxyService(options) },
        { provide: LocalStoreService, useValue: localStoreService },
        { provide: SkillRegistryService, useValue: new SkillRegistryService(localStoreService, options) },
        AgentProfileService,
        ProfileService,
        SettingsService,
      ],
    };
  }
}
