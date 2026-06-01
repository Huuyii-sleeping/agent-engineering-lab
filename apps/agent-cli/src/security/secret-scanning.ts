import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { recordAuditEvent } from "../audit/runtime.js";
import { recordObservabilityEvent, type ExecutionContext } from "../observability/runtime.js";
import { nowTimestampMs } from "../time.js";
import { sanitizeAndRedactText, sanitizeAndRedactValue } from "./data-hygiene.js";

export type SecretFindingAction = "block" | "warn" | "audit_only";
export type SecretFindingSeverity = "low" | "medium" | "high";
export type SecretFindingSourceKind = "tool_output" | "workspace_write" | "delivery_validation";

export type SecretFinding = {
  schemaVersion: 1;
  id: string;
  createdAt: number;
  sourceKind: SecretFindingSourceKind;
  targetPath?: string;
  toolName?: string;
  ruleId: string;
  action: SecretFindingAction;
  severity: SecretFindingSeverity;
  summary: string;
  preview: string;
  fingerprint: string;
};

export type SecretScanResult = {
  action: SecretFindingAction | null;
  findings: SecretFinding[];
  redactedText: string;
};

type SecretRule = {
  id: string;
  pattern: RegExp;
  action: SecretFindingAction;
  severity: SecretFindingSeverity;
  summary: string;
};

type SecretEventRecorder = (
  kind: string,
  payload: Record<string, unknown>,
  context?: Partial<ExecutionContext>,
) => Promise<unknown>;

const SECRET_RULES: SecretRule[] = [
  {
    id: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/g,
    action: "block",
    severity: "high",
    summary: "private key material detected",
  },
  {
    id: "openai-api-key",
    pattern: /\bsk-[A-Za-z0-9]{20,}\b/g,
    action: "block",
    severity: "high",
    summary: "OpenAI-style API key detected",
  },
  {
    id: "github-token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
    action: "block",
    severity: "high",
    summary: "GitHub token detected",
  },
  {
    id: "aws-access-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    action: "block",
    severity: "high",
    summary: "AWS access key detected",
  },
  {
    id: "bearer-token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{12,}\b/gi,
    action: "block",
    severity: "high",
    summary: "Bearer token detected",
  },
  {
    id: "generic-secret-assignment",
    pattern:
      /(["']?[A-Za-z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTHORIZATION)[A-Za-z0-9_]*["']?\s*[:=]\s*)(?:"[^"]{8,}"|'[^']{8,}'|`[^`]{8,}`|[^\s,"'`}\]]{8,})/gi,
    action: "warn",
    severity: "medium",
    summary: "secret-like assignment detected",
  },
  {
    id: "secret-hint",
    pattern: /\b(API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTHORIZATION)\b/gi,
    action: "audit_only",
    severity: "low",
    summary: "secret-related hint detected",
  },
];

const ACTION_PRIORITY: Record<SecretFindingAction, number> = {
  audit_only: 1,
  warn: 2,
  block: 3,
};

function makeFindingId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getSecretFindingsPath(): string {
  return path.join(process.cwd(), ".security", "secret-findings.json");
}

function getAuditPath(): string {
  return path.join(process.cwd(), ".audit", "security_events.jsonl");
}

function buildFingerprint(parts: Array<string | undefined>): string {
  return createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 24);
}

function dominantAction(findings: SecretFinding[]): SecretFindingAction | null {
  if (findings.length === 0) {
    return null;
  }
  return findings.reduce<SecretFindingAction>(
    (best, item) => (ACTION_PRIORITY[item.action] > ACTION_PRIORITY[best] ? item.action : best),
    findings[0].action,
  );
}

async function ensureSecurityStorage(): Promise<void> {
  await mkdir(path.dirname(getSecretFindingsPath()), { recursive: true });
  await mkdir(path.dirname(getAuditPath()), { recursive: true });
  try {
    await readFile(getSecretFindingsPath(), "utf8");
  } catch {
    await writeFile(getSecretFindingsPath(), "[]\n", "utf8");
  }
  try {
    await readFile(getAuditPath(), "utf8");
  } catch {
    await writeFile(getAuditPath(), "", "utf8");
  }
}

async function readTrackedFindings(): Promise<SecretFinding[]> {
  await ensureSecurityStorage();
  try {
    const raw = await readFile(getSecretFindingsPath(), "utf8");
    const parsed = JSON.parse(raw) as SecretFinding[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeTrackedFindings(findings: SecretFinding[]): Promise<void> {
  await ensureSecurityStorage();
  await writeFile(getSecretFindingsPath(), `${JSON.stringify(findings, null, 2)}\n`, "utf8");
}

async function appendAudit(type: string, payload: Record<string, unknown>): Promise<void> {
  await ensureSecurityStorage();
  const event = {
    at: nowTimestampMs(),
    type,
    payload: sanitizeAndRedactValue(payload) as Record<string, unknown>,
  };
  await writeFile(getAuditPath(), `${JSON.stringify(event)}\n`, { flag: "a", encoding: "utf8" });
}

function toFinding(input: {
  sourceKind: SecretFindingSourceKind;
  targetPath?: string;
  toolName?: string;
  rule: SecretRule;
  matchText: string;
}): SecretFinding {
  const preview = sanitizeAndRedactText(input.matchText).slice(0, 160);
  const fingerprint = buildFingerprint([
    input.sourceKind,
    input.targetPath,
    input.toolName,
    input.rule.id,
    preview,
  ]);
  return {
    schemaVersion: 1,
    id: makeFindingId("sf"),
    createdAt: nowTimestampMs(),
    sourceKind: input.sourceKind,
    targetPath: input.targetPath,
    toolName: input.toolName,
    ruleId: input.rule.id,
    action: input.rule.action,
    severity: input.rule.severity,
    summary: input.rule.summary,
    preview,
    fingerprint,
  };
}

export function scanTextForSecrets(input: {
  content: string;
  sourceKind: SecretFindingSourceKind;
  targetPath?: string;
  toolName?: string;
}): SecretScanResult {
  const findings: SecretFinding[] = [];
  const seen = new Set<string>();
  for (const rule of SECRET_RULES) {
    for (const match of input.content.matchAll(rule.pattern)) {
      const matchText = String(match[0] ?? "");
      if (!matchText || matchText.includes("[REDACTED_")) {
        continue;
      }
      const finding = toFinding({
        sourceKind: input.sourceKind,
        targetPath: input.targetPath,
        toolName: input.toolName,
        rule,
        matchText,
      });
      if (seen.has(finding.fingerprint)) {
        continue;
      }
      seen.add(finding.fingerprint);
      findings.push(finding);
    }
  }
  return {
    action: dominantAction(findings),
    findings,
    redactedText: sanitizeAndRedactText(input.content),
  };
}

export async function replaceTrackedWorkspaceFindings(
  targetPath: string,
  findings: SecretFinding[],
): Promise<void> {
  const existing = await readTrackedFindings();
  const retained = existing.filter((item) => !(item.sourceKind === "workspace_write" && item.targetPath === targetPath));
  const next = [...retained, ...findings];
  await writeTrackedFindings(next);
}

export async function readTrackedWorkspaceFindings(): Promise<SecretFinding[]> {
  return readTrackedFindings();
}

export async function reportSecretScan(input: {
  sourceKind: SecretFindingSourceKind;
  action: SecretFindingAction;
  findings: SecretFinding[];
  targetPath?: string;
  toolName?: string;
  traceId?: string;
  spanId?: string;
  rolledBack?: boolean;
  recordEvent?: SecretEventRecorder;
}): Promise<void> {
  if (input.findings.length === 0) {
    return;
  }
  const payload = {
    sourceKind: input.sourceKind,
    action: input.action,
    targetPath: input.targetPath ?? null,
    toolName: input.toolName ?? null,
    findingCount: input.findings.length,
    rolledBack: Boolean(input.rolledBack),
    findings: input.findings.map((item) => ({
      ruleId: item.ruleId,
      action: item.action,
      severity: item.severity,
      summary: item.summary,
      preview: item.preview,
      targetPath: item.targetPath ?? null,
      toolName: item.toolName ?? null,
    })),
  };
  await appendAudit("secret_scan_finding", payload);
  await recordAuditEvent({
    category: "security",
    action: "secret_scan_finding",
    outcome: input.action === "block" ? "blocked" : input.action === "warn" ? "failed" : "succeeded",
    subject: input.toolName ?? input.targetPath ?? input.sourceKind,
    summary: "secret scan finding",
    traceId: input.traceId,
    metadata: payload,
  });
  const recorder = input.recordEvent ?? recordObservabilityEvent;
  await recorder("secret_scan", payload, {
    traceId: input.traceId,
    spanId: input.spanId,
  });
}

export async function protectToolOutput(input: {
  toolName: string;
  output: string;
  traceId?: string;
  spanId?: string;
  recordEvent?: SecretEventRecorder;
}): Promise<{ output: string; findings: SecretFinding[]; action: SecretFindingAction | null }> {
  const scan = scanTextForSecrets({
    content: input.output,
    sourceKind: "tool_output",
    toolName: input.toolName,
  });
  if (!scan.action) {
    return { output: input.output, findings: [], action: null };
  }
  await reportSecretScan({
    sourceKind: "tool_output",
    action: scan.action,
    findings: scan.findings,
    toolName: input.toolName,
    traceId: input.traceId,
    spanId: input.spanId,
    recordEvent: input.recordEvent,
  });
  if (scan.action === "block") {
    return {
      output: JSON.stringify(
        {
          ok: false,
          error: {
            code: "SECURITY_SECRET_DETECTED",
            message: "tool output blocked by secret scanning",
          },
        },
        null,
        2,
      ),
      findings: scan.findings,
      action: scan.action,
    };
  }
  if (scan.action === "warn") {
    return {
      output: `${scan.redactedText}\n[security warning: secret-like output redacted]`,
      findings: scan.findings,
      action: scan.action,
    };
  }
  return {
    output: input.output,
    findings: scan.findings,
    action: scan.action,
  };
}
