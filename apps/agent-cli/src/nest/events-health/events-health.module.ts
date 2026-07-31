import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller.js";
import { HealthController } from "./health.controller.js";
import { OrbitFallbackController } from "./orbit-fallback.controller.js";

@Module({ controllers: [HealthController, EventsController, OrbitFallbackController] })
export class EventsHealthModule {}
