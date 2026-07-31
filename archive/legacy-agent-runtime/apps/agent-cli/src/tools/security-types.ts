export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Decision = "allow" | "deny" | "require_approval";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "consumed";

export type ApprovalRequest = {
  request_id: string;
  action: string;
  risk: RiskLevel;
  reason: string;
  scope: string;
  scopeHash?: string;
  status: ApprovalStatus;
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
  consumedAt?: number;
};

export type PolicyRule = {
  id: string;
  tool?: string;
  toolPrefix?: string;
  action: Decision;
  risk: RiskLevel;
  reason: string;
  commandIncludes?: string[];
  commandPrefixes?: string[];
  pathPrefixes?: string[];
};

export type PolicyConfig = {
  schemaVersion: number;
  rules: PolicyRule[];
};

export type PolicyInput = {
  toolName: string;
  args: Record<string, unknown>;
};

export type PolicyDecision = {
  decision: Decision;
  risk: RiskLevel;
  reason: string;
  matchedRule: string;
  scope: string;
  scopeHash: string;
};

export type SecurityGateResult =
  | { ok: true }
  | { ok: false; blocked: string };

export function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...data }, null, 2);
}

export function fail(code: string, message: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({ ok: false, error: { code, message }, ...(extra ?? {}) }, null, 2);
}

export function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseArgsJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
