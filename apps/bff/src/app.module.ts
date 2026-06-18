import { Module } from "@nestjs/common";
import { AgentProxyService, type AgentProxyOptions } from "./agent-proxy.service.js";
import { AgentProfileService } from "./agent-profile.service.js";
import { AppController } from "./app.controller.js";
import { LocalStoreService, type LocalStoreOptions } from "./local-store.service.js";
import { ProfileService } from "./profile.service.js";
import { SettingsService } from "./settings.service.js";

export type AppModuleOptions = AgentProxyOptions & LocalStoreOptions;

@Module({})
export class AppModule {
  static register(options: AppModuleOptions) {
    return {
      module: AppModule,
      controllers: [AppController],
      providers: [
        { provide: AgentProxyService, useValue: new AgentProxyService(options) },
        { provide: LocalStoreService, useValue: new LocalStoreService(options) },
        AgentProfileService,
        ProfileService,
        SettingsService,
      ],
    };
  }
}
