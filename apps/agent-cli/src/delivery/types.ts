export type DeliveryStageName =
  | "lint"
  | "test"
  | "build"
  | "regression"
  | "observability"
  | "hooks"
  | "recovery"
  | "scheduler";
export type DeliveryFailureCode =
  | "LINT_FAILED"
  | "TEST_FAILED"
  | "BUILD_FAILED"
  | "COMMAND_NOT_FOUND"
  | "TIMEOUT"
  | "TRANSIENT_EXEC_FAILURE";
export type DeliveryStatus = "passed" | "failed" | "skipped";

export type DeliveryFailure = {
  stage: DeliveryStageName;
  code: DeliveryFailureCode;
  message: string;
  suggestion: string;
};

export type DeliveryStageResult = {
  stage: DeliveryStageName;
  command: string[];
  status: DeliveryStatus;
  exitCode: number | null;
  durationMs: number;
  attempts: number;
  stdout: string;
  stderr: string;
  failure: DeliveryFailure | null;
  skippedReason: string | null;
};

export type DeliveryReport = {
  schemaVersion: number;
  generatedAt: number;
  mode: "manual" | "auto";
  changedPaths: string[];
  summary: {
    status: "passed" | "failed";
    totalStages: number;
    passedStages: number;
    failedStages: number;
    skippedStages: number;
  };
  stages: DeliveryStageResult[];
  latestFailure: DeliveryFailure | null;
  risks: string[];
  suggestions: string[];
};

export type DeliveryContext = {
  changedPaths: string[];
};

export type DeliveryStagePlan = {
  stage: DeliveryStageName;
  command: string[];
  condition?: (ctx: DeliveryContext) => boolean;
  skippedReason?: string;
};

export type DeliveryOptions = {
  mode?: "manual" | "auto";
  changedPaths?: string[];
  traceId?: string;
};

export const DELIVERY_MAX_CAPTURE = 6_000;

export function truncateDeliveryOutput(value: string): string {
  const text = value.trim();
  if (!text) {
    return "";
  }
  if (text.length <= DELIVERY_MAX_CAPTURE) {
    return text;
  }
  return `${text.slice(0, DELIVERY_MAX_CAPTURE)}\n...[truncated to ${DELIVERY_MAX_CAPTURE} chars]`;
}

export function summarizeDeliveryReport(report: DeliveryReport): string {
  const firstFailure = report.latestFailure;
  if (report.summary.status === "passed") {
    return `delivery validation passed: ${report.summary.passedStages}/${report.summary.totalStages} stages passed`;
  }
  if (!firstFailure) {
    return "delivery validation failed without a classified failure";
  }
  return `delivery validation failed at ${firstFailure.stage}: ${firstFailure.code} - ${firstFailure.message}`;
}
