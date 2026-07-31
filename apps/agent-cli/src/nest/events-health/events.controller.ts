import { Controller, Get, Headers, Inject, Query, Req, Res } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentService } from "../../service-api/index.js";
import { parseOptionalEventCursor, writeJson, writeSseEvent } from "../http.js";
import { AGENT_SERVICE } from "../tokens.js";
import { OrbitShutdownService } from "../orbit-shutdown.service.js";

@Controller()
export class EventsController {
  constructor(
    @Inject(AGENT_SERVICE) private readonly service: AgentService,
    @Inject(OrbitShutdownService) private readonly shutdown: OrbitShutdownService,
  ) {}

  @Get("bridge")
  bridge(): Record<string, unknown> {
    return this.service.bridgeManifest();
  }

  @Get("bridge/state")
  state(): Record<string, unknown> {
    return this.service.bridgeState();
  }

  @Get("events")
  events(
    @Query("since_id") sinceId: string | undefined,
    @Headers("last-event-id") lastEventId: string | undefined,
    @Req() req: IncomingMessage,
    @Res() res: ServerResponse,
  ): void {
    const raw = lastEventId ?? sinceId;
    const cursor = parseOptionalEventCursor(raw);
    if (cursor === undefined) {
      writeJson(res, 400, {
        ok: false,
        error: {
          code: "INVALID_CURSOR",
          message: `${lastEventId !== undefined ? "Last-Event-ID" : "since_id"} must be an integer cursor`,
          value: raw ?? "",
        },
      });
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const unregisterSse = this.shutdown.registerSseClient(res);
    writeSseEvent(res, {
      event: "bridge.ready",
      data: { ok: true, replay_from: cursor, bridge: this.service.bridgeState() },
    });
    for (const event of this.service.replayEventsSince(cursor)) {
      writeSseEvent(res, { id: event.id, event: event.type, data: event });
    }
    const unsubscribe = this.service.subscribeEvents((event) => {
      writeSseEvent(res, { id: event.id, event: event.type, data: event });
    });
    req.once("close", () => {
      unsubscribe();
      unregisterSse();
    });
  }
}
