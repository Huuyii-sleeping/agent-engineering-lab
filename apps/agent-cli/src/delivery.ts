import { execFile, type ExecFileException } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { promisify } from "node:util";
import { recordObservabilityEvent } from "./observability/runtime.js";
import { RUNTIME_CONFIG } from "./runtime-config.js";
import { nowTimestampMs } from "./time.js";

const execFileAsync = promisify(execFile);

export type DeliveryStageName = "lint" | "test" | "build" | "regression" | "observability" | "hooks" | "recovery" | "scheduler";
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

type DeliveryStagePlan = {
  stage: DeliveryStageName;
  command: string[];
  condition?: (ctx: DeliveryContext) => boolean;
  skippedReason?: string;
};

type DeliveryContext = {
  changedPaths: string[];
};

type DeliveryOptions = {
  mode?: "manual" | "auto";
  changedPaths?: string[];
  traceId?: string;
};

const MAX_CAPTURE = 6_000;

function getReportRoot(): string {
  return path.join(process.cwd(), ".delivery");
}

function getReportPath(): string {
  return path.join(getReportRoot(), "delivery_report.json");
}

function truncate(value: string): string {
  const text = value.trim();
  if (!text) {
    return "";
  }
  if (text.length <= MAX_CAPTURE) {
    return text;
  }
  return `${text.slice(0, MAX_CAPTURE)}\n...[truncated to ${MAX_CAPTURE} chars]`;
}

function fileExistsInJsonScript(pkgJson: string, script: string): boolean {
  try {
    const parsed = JSON.parse(pkgJson) as { scripts?: Record<string, string> };
    return typeof parsed.scripts?.[script] === "string" && parsed.scripts[script].trim().length > 0;
  } catch {
    return false;
  }
}

async function readPackageScripts(relativePath: string): Promise<string> {
  const file = path.join(process.cwd(), relativePath);
  return readFile(file, "utf8").catch(() => "{}");
}

async function buildPlan(ctx: DeliveryContext): Promise<DeliveryStagePlan[]> {
  const rootPkg = await readPackageScripts("package.json");
  const cliPkg = await readPackageScripts("apps/agent-cli/package.json");

  const hasRootLint = fileExistsInJsonScript(rootPkg, "lint");
  const hasRootTest = fileExistsInJsonScript(rootPkg, "test");
  const hasRootBuild = fileExistsInJsonScript(rootPkg, "build");
  const hasCliRegression = fileExistsInJsonScript(cliPkg, "test:regression");
  const hasCliObservability = fileExistsInJsonScript(cliPkg, "test:observability");
  const hasCliHooks = fileExistsInJsonScript(cliPkg, "test:hooks");
  const hasCliRecovery = fileExistsInJsonScript(cliPkg, "test:recovery");
  const hasCliScheduler = fileExistsInJsonScript(cliPkg, "test:scheduler");

  const touchesAgentCli = ctx.changedPaths.some((item) => item.startsWith("apps/agent-cli/"));

  return [
    {
      stage: "lint",
      command: ["pnpm", "lint"],
      condition: () => hasRootLint,
      skippedReason: "root package has no lint script",
    },
    {
      stage: "test",
      command: ["pnpm", "test"],
      condition: () => hasRootTest,
      skippedReason: "root package has no test script",
    },
    {
      stage: "build",
      command: ["pnpm", "build"],
      condition: () => hasRootBuild,
      skippedReason: "root package has no build script",
    },
    {
      stage: "regression",
      command: ["pnpm", "--filter", "agent-cli", "test:regression"],
      condition: () => touchesAgentCli && hasCliRegression,
      skippedReason: "agent-cli regression is not applicable for current changes",
    },
    {
      stage: "observability",
      command: ["pnpm", "--filter", "agent-cli", "test:observability"],
      condition: () => touchesAgentCli && hasCliObservability,
      skippedReason: "agent-cli observability smoke is not applicable for current changes",
    },
    {
      stage: "hooks",
      command: ["pnpm", "--filter", "agent-cli", "test:hooks"],
      condition: () => touchesAgentCli && hasCliHooks,
      skippedReason: "agent-cli hooks smoke is not applicable for current changes",
    },
    {
      stage: "recovery",
      command: ["pnpm", "--filter", "agent-cli", "test:recovery"],
      condition: () => touchesAgentCli && hasCliRecovery,
      skippedReason: "agent-cli recovery smoke is not applicable for current changes",
    },
    {
      stage: "scheduler",
      command: ["pnpm", "--filter", "agent-cli", "test:scheduler"],
      condition: () => touchesAgentCli && hasCliScheduler,
      skippedReason: "agent-cli scheduler smoke is not applicable for current changes",
    },
  ];
}

function classifyFailure(stage: DeliveryStageName, error: ExecFileException | Error | null, stderr: string): DeliveryFailure {
  const detail = truncate(stderr || error?.message || "validation failed");
  const message = detail || `stage ${stage} failed`;
  if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
    return {
      stage,
      code: "COMMAND_NOT_FOUND",
      message,
      suggestion: "Confirm pnpm and the referenced script exist in this workspace before retrying.",
    };
  }
  if ((error as NodeJS.ErrnoException | null)?.code === "ETIMEDOUT" || /timed out/i.test(message)) {
    return {
      stage,
      code: "TIMEOUT",
      message,
      suggestion: "Retry the same stage once the environment is stable, or reduce the scope of the validation command.",
    };
  }
  if ((error as NodeJS.ErrnoException | null)?.code && ["EAI_AGAIN", "ECONNRESET", "ECONNREFUSED"].includes(String((error as NodeJS.ErrnoException).code))) {
    return {
      stage,
      code: "TRANSIENT_EXEC_FAILURE",
      message,
      suggestion: "The failure looks transient. Retry the stage after the local environment or network recovers.",
    };
  }

  if (stage === "lint") {
    return {
      stage,
      code: "LINT_FAILED",
      message,
      suggestion: "Fix the reported lint or type issues, then rerun validation.",
    };
  }
  if (stage === "build") {
    return {
      stage,
      code: "BUILD_FAILED",
      message,
      suggestion: "Check recent type, import, or bundling changes in the touched packages before retrying the build.",
    };
  }
  return {
    stage,
    code: "TEST_FAILED",
    message,
    suggestion: "Inspect the failing test or smoke output and update the implementation or expectation before retrying.",
  };
}

function isRetryableFailure(failure: DeliveryFailure): boolean {
  return failure.code === "TIMEOUT" || failure.code === "TRANSIENT_EXEC_FAILURE";
}

async function runStage(plan: DeliveryStagePlan, traceId?: string): Promise<DeliveryStageResult> {
  let attempts = 0;
  const maxAttempts = 1 + RUNTIME_CONFIG.deliveryRetryMaxAttempts;
  let lastFailure: DeliveryFailure | null = null;
  let lastStdout = "";
  let lastStderr = "";

  while (attempts < maxAttempts) {
    attempts += 1;
    const startedAt = Date.now();
    try {
      const result = await execFileAsync(plan.command[0], plan.command.slice(1), {
        cwd: process.cwd(),
        timeout: RUNTIME_CONFIG.deliveryStageTimeoutMs,
        maxBuffer: 1024 * 1024 * 10,
      });
      const stageResult: DeliveryStageResult = {
        stage: plan.stage,
        command: plan.command,
        status: "passed",
        exitCode: 0,
        durationMs: Date.now() - startedAt,
        attempts,
        stdout: truncate(result.stdout ?? ""),
        stderr: truncate(result.stderr ?? ""),
        failure: null,
        skippedReason: null,
      };
      await recordObservabilityEvent(
        "delivery_stage",
        {
          stage: plan.stage,
          status: stageResult.status,
          attempts,
          durationMs: stageResult.durationMs,
        },
        traceId ? { traceId } : undefined,
      );
      return stageResult;
    } catch (error) {
      const execError = error as ExecFileException & { stdout?: string; stderr?: string };
      lastStdout = truncate(execError.stdout ?? "");
      lastStderr = truncate(execError.stderr ?? "");
      lastFailure = classifyFailure(plan.stage, execError, lastStderr);
      await recordObservabilityEvent(
        "delivery_stage",
        {
          stage: plan.stage,
          status: "failed",
          attempts,
          failureCode: lastFailure.code,
          retryable: isRetryableFailure(lastFailure),
        },
        traceId ? { traceId } : undefined,
      );
      if (!isRetryableFailure(lastFailure) || attempts >= maxAttempts) {
        return {
          stage: plan.stage,
          command: plan.command,
          status: "failed",
          exitCode: typeof execError.code === "number" ? execError.code : null,
          durationMs: Date.now() - startedAt,
          attempts,
          stdout: lastStdout,
          stderr: lastStderr,
          failure: lastFailure,
          skippedReason: null,
        };
      }
    }
  }

  return {
    stage: plan.stage,
    command: plan.command,
    status: "failed",
    exitCode: null,
    durationMs: 0,
    attempts,
    stdout: lastStdout,
    stderr: lastStderr,
    failure: lastFailure,
    skippedReason: null,
  };
}

function summarize(report: DeliveryReport): string {
  const firstFailure = report.latestFailure;
  if (report.summary.status === "passed") {
    return `delivery validation passed: ${report.summary.passedStages}/${report.summary.totalStages} stages passed`;
  }
  if (!firstFailure) {
    return "delivery validation failed without a classified failure";
  }
  return `delivery validation failed at ${firstFailure.stage}: ${firstFailure.code} - ${firstFailure.message}`;
}

export async function loadLatestDeliveryReport(): Promise<DeliveryReport | null> {
  try {
    const raw = await readFile(getReportPath(), "utf8");
    return JSON.parse(raw) as DeliveryReport;
  } catch {
    return null;
  }
}

export async function runDeliveryValidation(options: DeliveryOptions = {}): Promise<DeliveryReport> {
  const changedPaths = [...new Set(options.changedPaths ?? [])].sort();
  const ctx: DeliveryContext = { changedPaths };
  const plans = await buildPlan(ctx);
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
    const result = await runStage(plan, options.traceId);
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
  const suggestions = latestFailure ? [latestFailure.suggestion] : ["Validation passed. Delivery report is ready for review or archive."];

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

  await mkdir(getReportRoot(), { recursive: true });
  await writeFile(getReportPath(), `${JSON.stringify(report, null, 2)}\n`, "utf8");
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
      summary: summarize(report),
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
