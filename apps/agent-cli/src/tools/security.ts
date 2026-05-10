import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import { nowTimestampMs, parseOptionalTimestampMs, parseTimestampMs, plusSecondsMs } from "../time.js";

type RiskLevel = "low" | "medium" | "high" | "critical";
type Decision = "allow" | "deny" | "require_approval";
type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "consumed";

type ApprovalRequest = {
  request_id: string;
  action: string;
  risk: RiskLevel;
  reason: string;
  scope: string;
  status: ApprovalStatus;
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
  consumedAt?: number;
};

type PolicyRule = {
  id: string;
  tool: string;
  action: Decision;
  risk: RiskLevel;
  reason: string;
  commandIncludes?: string[];
  pathPrefixes?: string[];
};

type PolicyConfig = {
  schemaVersion: number;
  rules: PolicyRule[];
};

type PolicyInput = {
  toolName: string;
  args: Record<string, unknown>;
};

type PolicyDecision = {
  decision: Decision;
  risk: RiskLevel;
  reason: string;
  matchedRule: string;
  scope: string;
};

type SecurityGateResult =
  | { ok: true }
  | { ok: false; blocked: string };

function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...data }, null, 2);
}

function fail(code: string, message: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({ ok: false, error: { code, message }, ...(extra ?? {}) }, null, 2);
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

class SecurityManager {
  private readonly root = path.join(process.cwd(), ".security");
  private readonly auditRoot = path.join(process.cwd(), ".audit");
  private readonly policyPath = path.join(this.root, "policy.json");
  private readonly approvalPath = path.join(this.root, "approvals.json");
  private readonly auditPath = path.join(this.auditRoot, "security_events.jsonl");
  private initPromise: Promise<void> | null = null;
  private cachedPolicy: PolicyConfig | null = null;

  private async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await mkdir(this.root, { recursive: true });
        await mkdir(this.auditRoot, { recursive: true });
        await this.ensureFile(this.approvalPath, "[]\n");
        await this.ensurePolicy();
        await this.ensureFile(this.auditPath, "");
      })();
    }
    await this.initPromise;
  }

  private async ensureFile(filePath: string, content: string): Promise<void> {
    try {
      await readFile(filePath, "utf8");
    } catch {
      await writeFile(filePath, content, "utf8");
    }
  }

  private defaultPolicy(): PolicyConfig {
    return {
      schemaVersion: 1,
      rules: [
        {
          id: "bash-critical-deny",
          tool: "bash",
          action: "deny",
          risk: "critical",
          reason: "critical command is denied",
          commandIncludes: ["rm -rf /", "reboot", "shutdown", "format", "diskpart", "del /f /s /q"],
        },
        {
          id: "bash-high-approval",
          tool: "bash",
          action: "require_approval",
          risk: "high",
          reason: "high risk shell command requires approval",
          commandIncludes: ["git reset --hard", "Remove-Item -Recurse", "rd /s /q", "drop database"],
        },
        {
          id: "write-file-approval",
          tool: "write_file",
          action: "require_approval",
          risk: "medium",
          reason: "write operation requires approval by default",
        },
        {
          id: "edit-file-approval",
          tool: "edit_file",
          action: "require_approval",
          risk: "medium",
          reason: "edit operation requires approval by default",
        },
        {
          id: "background-run-approval",
          tool: "background_run",
          action: "require_approval",
          risk: "high",
          reason: "background shell execution requires approval",
        },
      ],
    };
  }

  private async ensurePolicy(): Promise<void> {
    try {
      await readFile(this.policyPath, "utf8");
    } catch {
      await writeFile(this.policyPath, `${JSON.stringify(this.defaultPolicy(), null, 2)}\n`, "utf8");
    }
  }

  private async loadPolicy(): Promise<PolicyConfig> {
    await this.ensureInit();
    if (this.cachedPolicy) {
      return this.cachedPolicy;
    }
    const raw = await readFile(this.policyPath, "utf8");
    const parsed = safeJsonParse<PolicyConfig>(raw, this.defaultPolicy());
    if (!Array.isArray(parsed.rules)) {
      parsed.rules = this.defaultPolicy().rules;
    }
    this.cachedPolicy = parsed;
    return parsed;
  }

  async reloadPolicy(): Promise<string> {
    this.cachedPolicy = null;
    const policy = await this.loadPolicy();
    await this.audit("policy_reload", { schemaVersion: policy.schemaVersion, ruleCount: policy.rules.length });
    return ok({ schemaVersion: policy.schemaVersion, ruleCount: policy.rules.length });
  }

  private async loadApprovals(): Promise<ApprovalRequest[]> {
    await this.ensureInit();
    const raw = await readFile(this.approvalPath, "utf8");
    const parsed = safeJsonParse<Array<Partial<ApprovalRequest>>>(raw, []);
    return parsed.map((item) => ({
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
    }));
  }

  private async saveApprovals(items: ApprovalRequest[]): Promise<void> {
    await writeFile(this.approvalPath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  }

  private async audit(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.ensureInit();
    const event = { at: nowTimestampMs(), type, payload };
    await writeFile(this.auditPath, `${JSON.stringify(event)}\n`, { flag: "a", encoding: "utf8" });
  }

  private matchRule(rule: PolicyRule, input: PolicyInput): boolean {
    if (rule.tool !== input.toolName) {
      return false;
    }
    if (rule.commandIncludes && rule.commandIncludes.length > 0) {
      const cmd = String(input.args.command ?? "");
      if (!rule.commandIncludes.some((snippet) => cmd.includes(snippet))) {
        return false;
      }
    }
    if (rule.pathPrefixes && rule.pathPrefixes.length > 0) {
      const targetPath = String(input.args.path ?? "");
      if (!rule.pathPrefixes.some((prefix) => targetPath.startsWith(prefix))) {
        return false;
      }
    }
    return true;
  }

  async evaluate(toolName: string, args: Record<string, unknown>): Promise<PolicyDecision> {
    const input: PolicyInput = { toolName, args };
    const policy = await this.loadPolicy();
    const matched = policy.rules.find((rule) => this.matchRule(rule, input));
    const scope = JSON.stringify({ toolName, args });
    const decision: PolicyDecision = matched
      ? {
          decision: matched.action,
          risk: matched.risk,
          reason: matched.reason,
          matchedRule: matched.id,
          scope,
        }
      : {
          decision: "allow",
          risk: "low",
          reason: "default allow",
          matchedRule: "default-allow",
          scope,
        };
    await this.audit("policy_decision", {
      toolName,
      decision: decision.decision,
      risk: decision.risk,
      reason: decision.reason,
      matchedRule: decision.matchedRule,
    });
    return decision;
  }

  async createApproval(toolName: string, args: Record<string, unknown>): Promise<string> {
    const decision = await this.evaluate(toolName, args);
    const id = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = nowTimestampMs();
    const request: ApprovalRequest = {
      request_id: id,
      action: toolName,
      risk: decision.risk,
      reason: decision.reason,
      scope: decision.scope,
      status: "pending",
      createdAt,
      expiresAt: plusSecondsMs(createdAt, RUNTIME_CONFIG.securityApprovalDefaultTtlSec),
    };
    const all = await this.loadApprovals();
    all.push(request);
    await this.saveApprovals(all);
    await this.audit("approval_created", {
      request_id: id,
      action: toolName,
      risk: decision.risk,
      reason: decision.reason,
    });
    return ok({ request });
  }

  async approve(requestIdArg: unknown): Promise<string> {
    const requestId = String(requestIdArg ?? "").trim();
    if (!requestId) {
      return fail("INVALID_ARGUMENT", "security_approve requires request_id");
    }
    const all = await this.loadApprovals();
    const item = all.find((row) => row.request_id === requestId);
    if (!item) {
      return fail("REQUEST_NOT_FOUND", `approval ${requestId} not found`);
    }
    if (item.status !== "pending") {
      return fail("INVALID_STATUS", `approval ${requestId} is ${item.status}`);
    }
    if (item.expiresAt <= Date.now()) {
      item.status = "expired";
      await this.saveApprovals(all);
      return fail("APPROVAL_EXPIRED", `approval ${requestId} expired`);
    }
    item.status = "approved";
    item.decidedAt = nowTimestampMs();
    await this.saveApprovals(all);
    await this.audit("approval_decision", { request_id: requestId, decision: "approved" });
    return ok({ request: item });
  }

  async reject(requestIdArg: unknown): Promise<string> {
    const requestId = String(requestIdArg ?? "").trim();
    if (!requestId) {
      return fail("INVALID_ARGUMENT", "security_reject requires request_id");
    }
    const all = await this.loadApprovals();
    const item = all.find((row) => row.request_id === requestId);
    if (!item) {
      return fail("REQUEST_NOT_FOUND", `approval ${requestId} not found`);
    }
    if (item.status !== "pending") {
      return fail("INVALID_STATUS", `approval ${requestId} is ${item.status}`);
    }
    item.status = "rejected";
    item.decidedAt = nowTimestampMs();
    await this.saveApprovals(all);
    await this.audit("approval_decision", { request_id: requestId, decision: "rejected" });
    return ok({ request: item });
  }

  async listApprovals(statusArg?: unknown): Promise<string> {
    const status = statusArg ? String(statusArg) : "";
    const all = await this.loadApprovals();
    const nowMs = Date.now();
    let mutated = false;
    for (const item of all) {
      if (item.status === "pending" && item.expiresAt <= nowMs) {
        item.status = "expired";
        mutated = true;
      }
    }
    if (mutated) {
      await this.saveApprovals(all);
    }
    const filtered = status ? all.filter((item) => item.status === status) : all;
    return ok({ approvals: filtered });
  }

  async consumeApproval(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    const all = await this.loadApprovals();
    const scope = JSON.stringify({ toolName, args });
    const nowMs = Date.now();
    const item = all.find(
      (row) =>
        row.action === toolName &&
        row.scope === scope &&
        row.status === "approved" &&
        row.expiresAt > nowMs,
    );
    if (!item) {
      return false;
    }
    item.status = "consumed";
    item.consumedAt = nowTimestampMs();
    await this.saveApprovals(all);
    await this.audit("approval_consumed", { request_id: item.request_id, action: toolName });
    return true;
  }

  async check(toolName: string, args: Record<string, unknown>): Promise<string> {
    const decision = await this.evaluate(toolName, args);
    return ok(decision);
  }

  async gate(toolName: string, args: Record<string, unknown>): Promise<SecurityGateResult> {
    const decision = await this.evaluate(toolName, args);
    if (decision.decision === "allow") {
      await this.audit("execution_allowed", { toolName, reason: decision.reason, risk: decision.risk });
      return { ok: true };
    }
    if (decision.decision === "deny") {
      const blocked = fail("SECURITY_POLICY_DENY", `blocked by policy: ${decision.reason}`, {
        risk: decision.risk,
        matchedRule: decision.matchedRule,
      });
      await this.audit("execution_blocked", { toolName, reason: decision.reason, risk: decision.risk });
      return { ok: false, blocked };
    }
    const consumed = await this.consumeApproval(toolName, args);
    if (consumed) {
      await this.audit("execution_allowed", { toolName, reason: "approval_consumed", risk: decision.risk });
      return { ok: true };
    }
    const blocked = fail(
      "SECURITY_APPROVAL_REQUIRED",
      `approval required: ${decision.reason}. call security_request_approval first`,
      {
        risk: decision.risk,
        matchedRule: decision.matchedRule,
      },
    );
    await this.audit("execution_blocked", { toolName, reason: "approval_required", risk: decision.risk });
    return { ok: false, blocked };
  }
}

const SECURITY = new SecurityManager();

export const SECURITY_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "security_check",
      description: "Check policy decision for a tool call.",
      parameters: {
        type: "object",
        properties: {
          tool: { type: "string" },
          args_json: { type: "string" },
        },
        required: ["tool"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "security_request_approval",
      description: "Create an approval request for a specific tool call.",
      parameters: {
        type: "object",
        properties: {
          tool: { type: "string" },
          args_json: { type: "string" },
        },
        required: ["tool"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "security_approve",
      description: "Approve an approval request by request_id.",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string" },
        },
        required: ["request_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "security_reject",
      description: "Reject an approval request by request_id.",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string" },
        },
        required: ["request_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "security_list_approvals",
      description: "List approval requests, optionally by status.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "approved", "rejected", "expired", "consumed"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "security_reload_policy",
      description: "Reload security policy from .security/policy.json.",
      parameters: { type: "object", properties: {} },
    },
  },
];

function parseArgsJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function runSecurityCheck(tool: unknown, argsJson: unknown): Promise<string> {
  const toolName = String(tool ?? "").trim();
  if (!toolName) {
    return fail("INVALID_ARGUMENT", "security_check requires tool");
  }
  return SECURITY.check(toolName, parseArgsJson(argsJson));
}

export async function runSecurityRequestApproval(tool: unknown, argsJson: unknown): Promise<string> {
  const toolName = String(tool ?? "").trim();
  if (!toolName) {
    return fail("INVALID_ARGUMENT", "security_request_approval requires tool");
  }
  return SECURITY.createApproval(toolName, parseArgsJson(argsJson));
}

export async function runSecurityApprove(requestId: unknown): Promise<string> {
  return SECURITY.approve(requestId);
}

export async function runSecurityReject(requestId: unknown): Promise<string> {
  return SECURITY.reject(requestId);
}

export async function runSecurityListApprovals(status: unknown): Promise<string> {
  return SECURITY.listApprovals(status);
}

export async function runSecurityReloadPolicy(): Promise<string> {
  return SECURITY.reloadPolicy();
}

export async function enforceSecurityGate(toolName: string, args: Record<string, unknown>): Promise<SecurityGateResult> {
  const bypass = toolName.startsWith("security_");
  if (bypass) {
    return { ok: true };
  }
  return SECURITY.gate(toolName, args);
}

