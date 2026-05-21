import { getExecutionContext, recordObservabilityEvent } from "../observability/runtime.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import { nowTimestampMs } from "../time.js";
import { SubagentExecutor, type SubagentExecutorLike } from "./subagent-executor.js";
import {
  err,
  ok,
  subagentSnapshot,
  type SubagentNotification,
  type SubagentRecord,
  type SubagentRole,
} from "./subagent-types.js";

export class SubagentManager {
  private nextId = 1;
  private readonly records = new Map<number, SubagentRecord>();
  private readonly runningJobs = new Map<number, Promise<void>>();
  private readonly notifications: SubagentNotification[] = [];

  constructor(private readonly executor: SubagentExecutorLike = new SubagentExecutor()) {}

  private now(): number {
    return nowTimestampMs();
  }

  private getRecord(agentIdArg: unknown): SubagentRecord | null {
    const agentId = Number(agentIdArg);
    if (!Number.isInteger(agentId) || agentId <= 0) {
      return null;
    }
    return this.records.get(agentId) ?? null;
  }

  private parseRole(roleArg: unknown): SubagentRole | null {
    if (roleArg === undefined || roleArg === null || String(roleArg).trim() === "") {
      return "worker";
    }
    const role = String(roleArg).trim();
    return role === "worker" || role === "coordinator" || role === "reviewer" ? role : null;
  }

  private parseParentAgentId(parentAgentIdArg: unknown): number | null | false {
    if (
      parentAgentIdArg === undefined ||
      parentAgentIdArg === null ||
      String(parentAgentIdArg).trim() === ""
    ) {
      return null;
    }
    const parentAgentId = Number(parentAgentIdArg);
    if (!Number.isInteger(parentAgentId) || parentAgentId <= 0) {
      return false;
    }
    return parentAgentId;
  }

  private pushCompletedNotification(record: SubagentRecord): void {
    void recordObservabilityEvent(
      "notification",
      {
        source: "subagent",
        agentId: record.id,
        agentName: record.name,
        role: record.role,
        parentAgentId: record.parentAgentId,
        status: "completed",
        output: record.lastOutput ?? "",
      },
      record.traceId ? { traceId: record.traceId } : undefined,
    );
    this.notifications.push({
      agentId: record.id,
      agentName: record.name,
      role: record.role,
      status: "completed",
      updatedAt: record.updatedAt,
      output: record.lastOutput,
    });
  }

  private pushFailedNotification(record: SubagentRecord): void {
    void recordObservabilityEvent(
      "notification",
      {
        source: "subagent",
        agentId: record.id,
        agentName: record.name,
        role: record.role,
        parentAgentId: record.parentAgentId,
        status: "failed",
        error: record.lastError ?? "",
      },
      record.traceId ? { traceId: record.traceId } : undefined,
    );
    this.notifications.push({
      agentId: record.id,
      agentName: record.name,
      role: record.role,
      status: "failed",
      updatedAt: record.updatedAt,
      error: record.lastError,
    });
  }

  private async execute(record: SubagentRecord, prompt: string): Promise<void> {
    const result = await this.executor.execute(prompt, record.traceId ?? undefined);
    record.updatedAt = this.now();

    if (result.status === "completed") {
      record.status = "completed";
      record.lastOutput = result.output;
      record.lastError = null;
      this.pushCompletedNotification(record);
      return;
    }

    record.status = "failed";
    record.lastError = result.error;
    this.pushFailedNotification(record);
  }

  async spawn(nameArg: unknown, roleArg?: unknown, parentAgentIdArg?: unknown): Promise<string> {
    const name = String(nameArg ?? "").trim() || `worker-${this.nextId}`;
    const role = this.parseRole(roleArg);
    if (!role) {
      return err("INVALID_ARGUMENT", "subagent_spawn role must be worker|coordinator|reviewer");
    }
    const parentAgentId = this.parseParentAgentId(parentAgentIdArg);
    if (parentAgentId === false) {
      return err("INVALID_ARGUMENT", "parent_agent_id must be a positive integer");
    }
    if (parentAgentId !== null && !this.records.has(parentAgentId)) {
      return err("AGENT_NOT_FOUND", `parent agent ${parentAgentId} not found`);
    }
    const now = this.now();
    const record: SubagentRecord = {
      id: this.nextId,
      name,
      role,
      parentAgentId,
      status: "idle",
      traceId: getExecutionContext()?.traceId ?? null,
      createdAt: now,
      updatedAt: now,
      lastInput: null,
      lastOutput: null,
      lastError: null,
    };
    this.records.set(record.id, record);
    this.nextId += 1;
    return ok({ agent: subagentSnapshot(record) });
  }

  async list(): Promise<string> {
    const agents = Array.from(this.records.values())
      .sort((a, b) => a.id - b.id)
      .map((record) => subagentSnapshot(record));
    return ok({ agents });
  }

  async send(agentIdArg: unknown, promptArg: unknown): Promise<string> {
    const record = this.getRecord(agentIdArg);
    if (!record) {
      return err("AGENT_NOT_FOUND", "subagent_send requires a valid agent_id");
    }
    if (record.status === "closed") {
      return err("AGENT_CLOSED", `agent ${record.id} is closed`);
    }
    if (record.status === "running") {
      return err("AGENT_BUSY", `agent ${record.id} is already running`);
    }

    const prompt = String(promptArg ?? "").trim();
    if (!prompt) {
      return err("INVALID_ARGUMENT", "subagent_send requires non-empty prompt");
    }

    record.status = "running";
    record.traceId = getExecutionContext()?.traceId ?? record.traceId;
    record.updatedAt = this.now();
    record.lastInput = prompt;
    record.lastOutput = null;
    record.lastError = null;

    const job = this.execute(record, prompt).finally(() => {
      this.runningJobs.delete(record.id);
    });
    this.runningJobs.set(record.id, job);

    return ok({ accepted: true, agent: subagentSnapshot(record) });
  }

  async wait(agentIdArg: unknown, timeoutMsArg: unknown): Promise<string> {
    const record = this.getRecord(agentIdArg);
    if (!record) {
      return err("AGENT_NOT_FOUND", "subagent_wait requires a valid agent_id");
    }

    const timeoutMsRaw =
      timeoutMsArg === undefined
        ? RUNTIME_CONFIG.subagentDefaultWaitTimeoutMs
        : Number(timeoutMsArg);
    if (!Number.isInteger(timeoutMsRaw) || timeoutMsRaw <= 0) {
      return err("INVALID_ARGUMENT", "timeout_ms must be a positive integer");
    }

    if (record.status !== "running") {
      return ok({ agent: subagentSnapshot(record) });
    }

    const runningJob = this.runningJobs.get(record.id);
    if (!runningJob) {
      return ok({ agent: subagentSnapshot(record) });
    }

    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      timeoutHandle = setTimeout(() => resolve("timeout"), timeoutMsRaw);
    });

    const result = await Promise.race([
      runningJob.then(() => "done" as const),
      timeoutPromise,
    ]);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    if (result === "timeout") {
      return err("WAIT_TIMEOUT", `agent ${record.id} did not finish within ${timeoutMsRaw}ms`, {
        agent: subagentSnapshot(record),
      });
    }

    return ok({ agent: subagentSnapshot(record) });
  }

  async close(agentIdArg: unknown): Promise<string> {
    const record = this.getRecord(agentIdArg);
    if (!record) {
      return err("AGENT_NOT_FOUND", "subagent_close requires a valid agent_id");
    }
    if (record.status === "running") {
      return err("AGENT_BUSY", `agent ${record.id} is running and cannot be closed`);
    }
    if (record.status === "closed") {
      return ok({ agent: subagentSnapshot(record) });
    }

    record.status = "closed";
    record.updatedAt = this.now();
    return ok({ agent: subagentSnapshot(record) });
  }

  drainNotifications(): SubagentNotification[] {
    const copy = [...this.notifications];
    this.notifications.length = 0;
    return copy;
  }
}
