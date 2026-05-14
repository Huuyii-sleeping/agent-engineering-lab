import { execFile, type ExecFileException } from "node:child_process";
import { promisify } from "node:util";
import { recordObservabilityEvent } from "../observability/runtime.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import type { DeliveryFailure, DeliveryStageName, DeliveryStagePlan, DeliveryStageResult } from "./types.js";
import { truncateDeliveryOutput } from "./types.js";

const execFileAsync = promisify(execFile);

export function resolveDeliveryCommand(
  command: string[],
  platform = process.platform,
): { file: string; args: string[] } {
  const [file, ...args] = command;
  if (platform === "win32" && file === "pnpm") {
    return {
      file: process.env.ComSpec?.trim() || "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm.cmd", ...args],
    };
  }
  return { file, args };
}

export function classifyDeliveryFailure(
  stage: DeliveryStageName,
  error: ExecFileException | Error | null,
  stderr: string,
): DeliveryFailure {
  const detail = truncateDeliveryOutput(stderr || error?.message || "validation failed");
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
  if (
    (error as NodeJS.ErrnoException | null)?.code &&
    ["EAI_AGAIN", "ECONNRESET", "ECONNREFUSED"].includes(String((error as NodeJS.ErrnoException).code))
  ) {
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

export function isRetryableDeliveryFailure(failure: DeliveryFailure): boolean {
  return failure.code === "TIMEOUT" || failure.code === "TRANSIENT_EXEC_FAILURE";
}

export async function runDeliveryStage(plan: DeliveryStagePlan, traceId?: string): Promise<DeliveryStageResult> {
  let attempts = 0;
  const maxAttempts = 1 + RUNTIME_CONFIG.deliveryRetryMaxAttempts;
  let lastFailure: DeliveryFailure | null = null;
  let lastStdout = "";
  let lastStderr = "";
  const resolvedCommand = resolveDeliveryCommand(plan.command);

  while (attempts < maxAttempts) {
    attempts += 1;
    const startedAt = Date.now();
    try {
      const result = await execFileAsync(resolvedCommand.file, resolvedCommand.args, {
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
        stdout: truncateDeliveryOutput(result.stdout ?? ""),
        stderr: truncateDeliveryOutput(result.stderr ?? ""),
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
      lastStdout = truncateDeliveryOutput(execError.stdout ?? "");
      lastStderr = truncateDeliveryOutput(execError.stderr ?? "");
      lastFailure = classifyDeliveryFailure(plan.stage, execError, lastStderr);
      await recordObservabilityEvent(
        "delivery_stage",
        {
          stage: plan.stage,
          status: "failed",
          attempts,
          failureCode: lastFailure.code,
          retryable: isRetryableDeliveryFailure(lastFailure),
        },
        traceId ? { traceId } : undefined,
      );
      if (!isRetryableDeliveryFailure(lastFailure) || attempts >= maxAttempts) {
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
