import { Module } from "@nestjs/common";
import { AgentController } from "./agent.controller.js";

@Module({ controllers: [AgentController] })
export class AgentRuntimeModule {}
