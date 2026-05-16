import { readFile } from "node:fs/promises";
import { recordObservabilityEvent } from "../observability/runtime.js";
import {
  replaceTrackedWorkspaceFindings,
  reportSecretScan,
  scanTextForSecrets,
  type SecretFinding,
} from "../security/secret-scanning.js";
import { nowTimestampMs } from "../time.js";
import { buildDeliveryPlan } from "./plan.js";
import { loadLatestDeliveryReportFromStore, saveDeliveryReport } from "./report-store.js";
import { runDeliveryStage } from "./runner.js";
import type { DeliveryContext, DeliveryOptions, DeliveryReport, DeliveryStageResult } from "./types.js";
import { summarizeDeliveryReport } from "./types.js";

export type {
  DeliveryContext,
  DeliveryFailure,
  DeliveryFailureCode,
  DeliveryOptions,
  DeliveryReport,
  DeliveryStageName,
  DeliveryStagePlan,
  DeliveryStageResult,
  DeliveryStatus,
} from "./types.js";

export async function loadLatestDeliveryReport(): Promise<DeliveryReport | null> {
  return loadLatestDeliveryReportFromStore();
}

async function scanChangedPathsForSecrets(
  changedPaths: string[],
  traceId?: string,
): Promise<{ findings: SecretFinding[]; action: "block" | "warn" | "audit_only" | null }> {
  const findings: SecretFinding[] = [];
  for (const changedPath of changedPaths) {
    try {
      const content = await readFile(changedPath, "utf8");
      const result = scanTextForSecrets({
        content,
        sourceKind: "delivery_validation",
        targetPath: changedPath,
      });
      await replaceTrackedWorkspaceFindings(changedPath, result.findings);
      if (result.action) {
        await reportSecretScan({
          sourceKind: "delivery_validation",
          action: result.action,
          findings: result.findings,
          targetPath: changedPath,
          traceId,
        });
        findings.push(...result.findings);
      }
    } catch {
      // ignore missing or unreadable changed paths during delivery scanning
    }
  }
  const action = findings.reduce<"block" | "warn" | "audit_only" | null>(
    (best, item) => {
      if (item.action === "block") {
        return "block";
      }
      if (item.action === "warn" && best !== "block") {
        return "warn";
      }
      if (item.action === "audit_only" && !best) {
        return "audit_only";
      }
      return best;
    },
    null,
  );
  return { findings, action };
}

export async function runDeliveryValidation(options: DeliveryOptions = {}): Promise<DeliveryReport> {
  const changedPaths = [...new Set(options.changedPaths ?? [])].sort();
  const ctx: DeliveryContext = { changedPaths };
  const plans = await buildDeliveryPlan(ctx);
  const stages: DeliveryStageResult[] = [];

  const secretScan = await scanChangedPathsForSecrets(changedPaths, options.traceId);
  if (secretScan.action === "block" || secretScan.action === "warn") {
    const failedStage: DeliveryStageResult = {
      stage: "security",
      command: [],
      status: "failed",
      exitCode: null,
      durationMs: 0,
      attempts: 1,
      stdout: "",
      stderr: secretScan.findings
        .slice(0, 3)
        .map((item) => `${item.targetPath ?? "unknown"}: ${item.summary}`)
        .join("\n"),
      failure: {
        stage: "security",
        code: secretScan.action === "block" ? "SECRET_FINDINGS_BLOCKED" : "SECRET_FINDINGS_REVIEW_REQUIRED",
        message:
          secretScan.action === "block"
            ? "high-confidence secret findings remain in changed files"
            : "secret-like findings require manual review before delivery",
        suggestion:
          secretScan.action === "block"
            ? "Remove or rotate the detected secret material, then rerun validation."
            : "Review the flagged files, redact secret-like values, and rerun validation.",
      },
      skippedReason: null,
    };
    stages.push(failedStage);
  } else {
    stages.push({
      stage: "security",
      command: [],
      status: "passed",
      exitCode: 0,
      durationMs: 0,
      attempts: 1,
      stdout: secretScan.action === "audit_only" ? "audit-only secret hints recorded" : "",
      stderr: "",
      failure: null,
      skippedReason: null,
    });
  }

  for (const plan of stages[0]?.status === "failed" ? [] : plans) {
    if (plan.condition && !plan.condition(ctx)) {
      stages.push({
        stage: plan.stage,
        command: plan.command,
        status: "skipped",
        exitCode: null,
        durationMs: 0,
        attempts: 0,
        stdout: "",
        stderr: "",
        failure: null,
        skippedReason: plan.skippedReason ?? "stage not applicable",
      });
      continue;
    }
    const result = await runDeliveryStage(plan, options.traceId);
    stages.push(result);
    if (result.status === "failed") {
      break;
    }
  }

  const failed = stages.filter((item) => item.status === "failed");
  const skipped = stages.filter((item) => item.status === "skipped");
  const passed = stages.filter((item) => item.status === "passed");
  const latestFailure = failed[0]?.failure ?? null;
  const risks = latestFailure
    ? [
        latestFailure.stage === "security"
          ? `secret findings blocked delivery validation: ${latestFailure.code}`
          : `validation failed at ${latestFailure.stage} with ${latestFailure.code}`,
      ]
    : [];
  const suggestions = latestFailure
    ? [latestFailure.suggestion]
    : ["Validation passed. Delivery report is ready for review or archive."];

  const report: DeliveryReport = {
    schemaVersion: 1,
    generatedAt: nowTimestampMs(),
    mode: options.mode ?? "manual",
    changedPaths,
    summary: {
      status: failed.length > 0 ? "failed" : "passed",
      totalStages: stages.length,
      passedStages: passed.length,
      failedStages: failed.length,
      skippedStages: skipped.length,
    },
    stages,
    latestFailure,
    risks,
    suggestions,
  };

  await saveDeliveryReport(report);
  await recordObservabilityEvent(
    "delivery_report",
    {
      mode: report.mode,
      status: report.summary.status,
      changedPathCount: changedPaths.length,
      latestFailureCode: latestFailure?.code ?? null,
    },
    options.traceId ? { traceId: options.traceId } : undefined,
  );
  return report;
}

export async function runDeliveryValidateTool(changedPaths?: unknown, mode?: unknown): Promise<string> {
  const report = await runDeliveryValidation({
    mode: mode === "auto" ? "auto" : "manual",
    changedPaths: Array.isArray(changedPaths) ? changedPaths.filter((item): item is string => typeof item === "string") : [],
  });
  return JSON.stringify(
    {
      ok: report.summary.status === "passed",
      summary: summarizeDeliveryReport(report),
      report,
    },
    null,
    2,
  );
}

export async function runDeliveryReportTool(): Promise<string> {
  const report = await loadLatestDeliveryReport();
  if (!report) {
    return JSON.stringify(
      {
        ok: false,
        error: {
          code: "REPORT_NOT_FOUND",
          message: "No delivery report has been generated yet.",
        },
      },
      null,
      2,
    );
  }
  return JSON.stringify({ ok: true, report }, null, 2);
}
