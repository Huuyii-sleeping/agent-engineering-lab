import { DynamicModule, Global, Module } from "@nestjs/common";
import type { AgentService } from "../service-api/index.js";
import {
  AGENT_RUNTIME_PORT,
  AGENT_SERVICE,
  MEMORY_RUNTIME_PORT,
  RUNTIME_GATEWAY,
  TOOL_EXECUTION_PORT,
  WORKFLOW_RUNTIME_PORT,
} from "./tokens.js";
import { OrbitShutdownService } from "./orbit-shutdown.service.js";

@Global()
@Module({})
export class RuntimeGatewayModule {
  /** 将进程级产品服务和四个 Runtime Port 注册为 Nest 单例。 */
  static register(service: AgentService): DynamicModule {
    return {
      module: RuntimeGatewayModule,
      providers: [
        { provide: AGENT_SERVICE, useValue: service },
        { provide: RUNTIME_GATEWAY, useValue: service.runtimeGateway },
        { provide: AGENT_RUNTIME_PORT, useValue: service.runtimeGateway.agent },
        { provide: WORKFLOW_RUNTIME_PORT, useValue: service.runtimeGateway.workflow },
        { provide: TOOL_EXECUTION_PORT, useValue: service.runtimeGateway.tools },
        { provide: MEMORY_RUNTIME_PORT, useValue: service.runtimeGateway.memory },
        OrbitShutdownService,
      ],
      exports: [
        AGENT_SERVICE,
        RUNTIME_GATEWAY,
        AGENT_RUNTIME_PORT,
        WORKFLOW_RUNTIME_PORT,
        TOOL_EXECUTION_PORT,
        MEMORY_RUNTIME_PORT,
        OrbitShutdownService,
      ],
    };
  }
}
