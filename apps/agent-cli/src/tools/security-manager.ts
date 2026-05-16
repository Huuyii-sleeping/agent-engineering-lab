import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { sanitizeAndRedactValue, stableScopeHash } from "../security/data-hygiene.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import { nowTimestampMs, plusSecondsMs } from "../time.js";
import { SecurityApprovalStore } from "./security-approvals.js";
import { defaultSecurityPolicy, evaluateSecurityPolicy, mergeSecurityPolicy } from "./security-policy.js";
import type { ApprovalRequest, PolicyConfig, PolicyDecision, SecurityGateResult } from "./security-types.js";
import { fail, ok, safeJsonParse } from "./security-types.js";

export class SecurityManager {
  private readonly root: string;
  private readonly auditRoot: string;
  private readonly policyPath: string;
  private readonly approvalPath: string;
  private readonly auditPath: string;
  private readonly approvalStore: SecurityApprovalStore;
  private initPromise: Promise<void> | null = null;
  private cachedPolicy: PolicyConfig | null = null;

  constructor(root = path.join(process.cwd(), ".security"), auditRoot = path.join(process.cwd(), ".audit")) {
    this.root = root;
    this.auditRoot = auditRoot;
    this.policyPath = path.join(this.root, "policy.json");
    this.approvalPath = path.join(this.root, "approvals.json");
    this.auditPath = path.join(this.auditRoot, "security_events.jsonl");
    this.approvalStore = new SecurityApprovalStore(this.approvalPath);
  }

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

  private async ensurePolicy(): Promise<void> {
    try {
      await readFile(this.policyPath, "utf8");
    } catch {
      await writeFile(this.policyPath, `${JSON.stringify(defaultSecurityPolicy(), null, 2)}\n`, "utf8");
    }
  }

  private async loadPolicy(): Promise<PolicyConfig> {
    await this.ensureInit();
    if (this.cachedPolicy) {
      return this.cachedPolicy;
    }
    const raw = await readFile(this.policyPath, "utf8");
    const parsed = safeJsonParse<PolicyConfig>(raw, defaultSecurityPolicy());
    this.cachedPolicy = mergeSecurityPolicy(parsed);
    return this.cachedPolicy;
  }

  async reloadPolicy(): Promise<string> {
    this.cachedPolicy = null;
    const policy = await this.loadPolicy();
    await this.audit("policy_reload", { schemaVersion: policy.schemaVersion, ruleCount: policy.rules.length });
    return ok({ schemaVersion: policy.schemaVersion, ruleCount: policy.rules.length });
  }

  private async loadApprovals(): Promise<ApprovalRequest[]> {
    await this.ensureInit();
    return this.approvalStore.load();
  }

  private async saveApprovals(items: ApprovalRequest[]): Promise<void> {
    await this.approvalStore.save(items);
  }

  private async audit(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.ensureInit();
    const event = { at: nowTimestampMs(), type, payload: sanitizeAndRedactValue(payload) as Record<string, unknown> };
    await writeFile(this.auditPath, `${JSON.stringify(event)}\n`, { flag: "a", encoding: "utf8" });
  }

  async evaluate(toolName: string, args: Record<string, unknown>): Promise<PolicyDecision> {
    const policy = await this.loadPolicy();
    const decision = evaluateSecurityPolicy(policy, { toolName, args });
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
      scopeHash: decision.scopeHash,
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
    const scopeHash = stableScopeHash(toolName, args);
    const legacyScope = JSON.stringify({ toolName, args });
    const nowMs = Date.now();
    const item = all.find(
      (row) =>
        row.action === toolName &&
        ((row.scopeHash && row.scopeHash === scopeHash) || (!row.scopeHash && row.scope === legacyScope)) &&
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
