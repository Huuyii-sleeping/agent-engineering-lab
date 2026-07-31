import { Module } from "@nestjs/common";
import { WorkflowController } from "./workflow.controller.js";

@Module({ controllers: [WorkflowController] })
export class WorkflowRuntimeModule {}
