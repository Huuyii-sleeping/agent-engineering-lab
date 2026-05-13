import { recordObservabilityEvent } from "./observability/runtime.js";
import { nowTimestampMs } from "./time.js";
import { buildDeliveryPlan } from "./delivery-plan.js";
import { loadLatestDeliveryReportFromStore, saveDeliveryReport } from "./delivery-report-store.js";
import { runDeliveryStage } from "./delivery-runner.js";
import type { DeliveryContext, DeliveryOptions, DeliveryReport, DeliveryStageResult } from "./delivery-types.js";
import { summarizeDeliveryReport } from "./delivery-types.js";

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
} from "./delivery-types.js";

export async function loadLatestDeliveryReport(): Promise<DeliveryReport | null> {
  return loadLatestDeliveryReportFromStore();
}

export async function runDeliveryValidation(options: DeliveryOptions = {}): Promise<DeliveryReport> {
  const changedPaths = [...new Set(options.changedPaths ?? [])].sort();
  const ctx: DeliveryContext = { changedPaths };
  const plans = await buildDeliveryPlan(ctx);
  const stages: DeliveryStageResult[] = [];

  for (const plan of plans) {
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
  const risks = latestFailure ? [`validation failed at ${latestFailure.stage} with ${latestFailure.code}`] : [];
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
