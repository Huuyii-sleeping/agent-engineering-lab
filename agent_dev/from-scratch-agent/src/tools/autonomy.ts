import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { runClaimTask, runScanUnclaimedTasks } from "./task-board.js";

export const POLL_INTERVAL_MS = 5_000;
export const IDLE_TIMEOUT_MS = 60_000;

type AutonomyStatus = "idle" | "claiming" | "working" | "shutdown";

type AutonomyRuntime = {
  status: AutonomyStatus;
  owner: string;
  lastActiveAt: number;
  currentTaskId: number | null;
};

let runtime: AutonomyRuntime = {
  status: "idle",
  owner: "main",
  lastActiveAt: Date.now(),
  currentTaskId: null,
};

const lockPath = path.join(process.cwd(), ".tasks", ".claim.lock");

function now(): number {
  return Date.now();
}

function toResult(data: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...data }, null, 2);
}

function toError(code: string, message: string): string {
  return JSON.stringify({ ok: false, error: { code, message } }, null, 2);
}

async function withClaimLock<T>(fn: () => Promise<T>): Promise<T> {
  try {
    await readFile(lockPath, "utf8");
    throw new Error("CLAIM_LOCKED");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg !== "CLAIM_LOCKED" && !msg.includes("ENOENT")) {
      throw error;
    }
  }
  await writeFile(lockPath, String(process.pid), "utf8");
  try {
    return await fn();
  } finally {
    await writeFile(lockPath, "", "utf8").catch(() => {});
  }
}

export async function runAutonomySetOwner(ownerArg: unknown): Promise<string> {
  const owner = String(ownerArg ?? "").trim();
  if (!owner) {
    return toError("INVALID_ARGUMENT", "autonomy_set_owner requires owner");
  }
  runtime.owner = owner;
  runtime.lastActiveAt = now();
  return toResult({ runtime });
}

export async function runAutonomyStatus(): Promise<string> {
  return toResult({
    runtime: {
      ...runtime,
      pollIntervalMs: POLL_INTERVAL_MS,
      idleTimeoutMs: IDLE_TIMEOUT_MS,
    },
  });
}

export async function runAutonomyTick(): Promise<string> {
  const elapsed = now() - runtime.lastActiveAt;
  if (runtime.status === "idle" && elapsed > IDLE_TIMEOUT_MS) {
    runtime.status = "shutdown";
    return toResult({ action: "shutdown", reason: "idle_timeout", runtime });
  }
  if (runtime.status === "shutdown") {
    return toResult({ action: "noop", reason: "already_shutdown", runtime });
  }

  runtime.status = "claiming";
  try {
    const scanRaw = await runScanUnclaimedTasks();
    const scan = JSON.parse(scanRaw) as { ok?: boolean; tasks?: Array<{ id: number }> };
    if (!scan.ok || !scan.tasks || scan.tasks.length === 0) {
      runtime.status = "idle";
      return toResult({ action: "noop", reason: "no_unclaimed_tasks", runtime });
    }

    const targetTaskId = scan.tasks[0].id;
    const claimRaw = await withClaimLock(async () => runClaimTask(targetTaskId, runtime.owner));
    const claim = JSON.parse(claimRaw) as { ok?: boolean; error?: { code?: string }; task?: { id?: number } };
    if (!claim.ok) {
      runtime.status = "idle";
      return toResult({ action: "noop", reason: claim.error?.code ?? "claim_failed", runtime });
    }
    runtime.status = "working";
    runtime.currentTaskId = claim.task?.id ?? targetTaskId;
    runtime.lastActiveAt = now();
    return toResult({ action: "claimed", taskId: runtime.currentTaskId, runtime });
  } catch (error) {
    runtime.status = "idle";
    return toError("AUTONOMY_TICK_ERROR", error instanceof Error ? error.message : String(error));
  }
}

export async function runAutonomyMarkActive(): Promise<string> {
  runtime.lastActiveAt = now();
  if (runtime.status === "shutdown") {
    runtime.status = "idle";
  }
  return toResult({ runtime });
}
