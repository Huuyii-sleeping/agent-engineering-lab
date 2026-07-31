import { Module } from "@nestjs/common";
import { MemoryController } from "./memory.controller.js";

@Module({ controllers: [MemoryController] })
export class MemoryRuntimeModule {}
