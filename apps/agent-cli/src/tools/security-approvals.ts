import { readFile, writeFile } from "node:fs/promises";
import { nowTimestampMs, parseOptionalTimestampMs, parseTimestampMs } from "../time.js";
import type { ApprovalRequest } from "./security-types.js";
import { safeJsonParse } from "./security-types.js";

export function normalizeApprovalRequest(item: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    request_id: String(item.request_id ?? ""),
    action: String(item.action ?? ""),
    risk:
      item.risk === "low" || item.risk === "medium" || item.risk === "high" || item.risk === "critical"
        ? item.risk
        : "medium",
    reason: String(item.reason ?? ""),
    scope: String(item.scope ?? ""),
    status:
      item.status === "pending" ||
      item.status === "approved" ||
      item.status === "rejected" ||
      item.status === "expired" ||
      item.status === "consumed"
        ? item.status
        : "pending",
    createdAt: parseTimestampMs(item.createdAt, nowTimestampMs()),
    expiresAt: parseTimestampMs(item.expiresAt, nowTimestampMs()),
    decidedAt: parseOptionalTimestampMs(item.decidedAt) ?? undefined,
    consumedAt: parseOptionalTimestampMs(item.consumedAt) ?? undefined,
  };
}

export class SecurityApprovalStore {
  constructor(private readonly approvalPath: string) {}

  async load(): Promise<ApprovalRequest[]> {
    const raw = await readFile(this.approvalPath, "utf8");
    const parsed = safeJsonParse<Array<Partial<ApprovalRequest>>>(raw, []);
    return parsed.map((item) => normalizeApprovalRequest(item));
  }

  async save(items: ApprovalRequest[]): Promise<void> {
    await writeFile(this.approvalPath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  }
}
