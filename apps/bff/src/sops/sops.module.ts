import { Module, type DynamicModule } from "@nestjs/common";
import { SopDatabase, type SopDatabaseOptions } from "./sop-database.js";
import { SopTemplatesController } from "./sop-templates.controller.js";
import { SopsController } from "./sops.controller.js";
import { SopsService } from "./sops.service.js";
import { SqliteSopsRepository } from "./sqlite-sops.repository.js";

/** 独立 SOP 领域模块，封装 SQLite、repository、service 和薄 controller。 */
@Module({})
export class SopsModule {
  static register(options: SopDatabaseOptions, database = new SopDatabase(options)): DynamicModule {
    return {
      module: SopsModule,
      controllers: [SopsController, SopTemplatesController],
      providers: [
        { provide: SopDatabase, useValue: database },
        SqliteSopsRepository,
        SopsService,
      ],
      exports: [SopsService, SopDatabase],
    };
  }
}
