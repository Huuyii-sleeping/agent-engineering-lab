import "reflect-metadata";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import type { Mastra } from "@mastra/core/mastra";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import {
  getOrCreateMastraRuntime,
  shutdownMastraRuntime,
} from "../mastra/instance/factory.js";
import type { AgentService } from "../service-api/index.js";
import type { AgentServerLike } from "../service-api/server.js";
import { AgentAppModule } from "./agent-app.module.js";
import { OrbitHttpExceptionFilter } from "./orbit-http-exception.filter.js";
import { OrbitShutdownService } from "./orbit-shutdown.service.js";

export type CreateNestAgentServerOptions = {
  mastra?: Mastra;
  runtimeRoot?: string;
  cleanupMastra?: () => Promise<void>;
  enableShutdownHooks?: boolean;
};

class NestAgentServer extends EventEmitter implements AgentServerLike {
  private httpServer: Server | null = null;
  private listening: Promise<void> | null = null;
  private closing: Promise<void> | null = null;

  constructor(
    private readonly app: NestExpressApplication,
    private readonly orbitShutdown: OrbitShutdownService,
  ) {
    super();
  }

  listen(port: number, host: string, callback?: () => void): this {
    if (this.listening) throw new Error("Nest Agent server is already listening");
    this.listening = this.app.listen(port, host)
      .then((server) => {
        this.httpServer = server;
        callback?.();
      })
      .catch((error) => {
        this.emit("error", error instanceof Error ? error : new Error(String(error)));
      });
    return this;
  }

  close(callback?: (error?: Error) => void): this {
    if (!this.closing) {
      this.closing = (async () => {
        await this.listening;
        this.orbitShutdown.closeSseClients();
        await this.app.close();
        this.emit("close");
      })();
    }
    void this.closing.then(
      () => callback?.(),
      (error) => callback?.(error instanceof Error ? error : new Error(String(error))),
    );
    return this;
  }

  closeIdleConnections(): void {
    this.httpServer?.closeIdleConnections?.();
  }

  closeAllConnections(): void {
    this.httpServer?.closeAllConnections?.();
  }

  address(): ReturnType<Server["address"]> {
    return this.httpServer?.address() ?? null;
  }
}

/** 创建 NestJS Express 宿主；默认复用进程级共享 Mastra instance。 */
export async function createNestAgentHttpServer(
  service: AgentService,
  options: CreateNestAgentServerOptions = {},
): Promise<AgentServerLike> {
  const sharedRuntime = options.mastra
    ? null
    : await getOrCreateMastraRuntime({ root: options.runtimeRoot });
  const mastra = options.mastra ?? sharedRuntime?.mastra;
  if (!mastra) throw new Error("Mastra runtime is required to create the Nest Agent service");
  let cleaned = false;
  const cleanupMastra = async () => {
    if (cleaned) return;
    cleaned = true;
    if (options.cleanupMastra) {
      await options.cleanupMastra();
      return;
    }
    if (sharedRuntime) {
      await shutdownMastraRuntime({ root: options.runtimeRoot });
      return;
    }
    await mastra.shutdown();
  };
  const app = await NestFactory.create<NestExpressApplication>(
    AgentAppModule.register({ service, mastra, cleanupMastra }),
    { logger: false },
  );
  app.useGlobalFilters(new OrbitHttpExceptionFilter());
  if (options.enableShutdownHooks) app.enableShutdownHooks(["SIGINT", "SIGTERM"]);
  return new NestAgentServer(app, app.get(OrbitShutdownService));
}
