import { Module } from "@nestjs/common";
import { ToolController } from "./tool.controller.js";

@Module({ controllers: [ToolController] })
export class ToolExecutionModule {}
