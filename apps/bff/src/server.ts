import { NestFactory } from "@nestjs/core";
import type { Server } from "node:http";
import "reflect-metadata";
import { AppModule, type AppModuleOptions } from "./app.module.js";
import { applyHeaderSetters } from "./http-utils.js";

export type BffServerOptions = AppModuleOptions;

/** Create the Web BFF HTTP server backed by the Nest application. */
export async function createBffHttpServer(options: BffServerOptions): Promise<Server> {
  const app = await NestFactory.create(AppModule.register(options), { logger: ["error"] });
  app.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    applyHeaderSetters(res);
    next();
  });
  app.enableCors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Last-Event-ID"],
  });
  await app.init();
  return app.getHttpServer() as Server;
}
