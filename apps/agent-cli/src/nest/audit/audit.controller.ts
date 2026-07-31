import { Controller, Get, Query } from "@nestjs/common";
import { readAuditEvents, type AuditCategory } from "../../audit/runtime.js";
import { parsePositiveLimit } from "../http.js";

function auditCategory(raw: string | undefined): AuditCategory | undefined {
  return raw === "session" || raw === "tool" || raw === "security" || raw === "retention" ? raw : undefined;
}

@Controller("audit")
export class AuditController {
  @Get("events")
  async events(
    @Query("limit") limit: string | undefined,
    @Query("session_id") sessionId: string | undefined,
    @Query("trace_id") traceId: string | undefined,
    @Query("category") category: string | undefined,
  ): Promise<Record<string, unknown>> {
    return {
      ok: true,
      events: await readAuditEvents({
        limit: parsePositiveLimit(limit),
        sessionId,
        traceId,
        category: auditCategory(category),
      }),
    };
  }
}
