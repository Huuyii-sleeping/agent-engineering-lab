import path from "node:path";
import { stableSerialize, type AgentVersion, type WorkflowIR, type WorkflowRunSnapshot } from "@orbit/workflow-core";
import { RuntimePortError } from "@orbit/runtime-contracts";
import { isLocalPersistenceEnabled } from "../../runtime-config.js";
import { retentionDaysFor } from "../../security/local-retention.js";
import { JsonFileRepository } from "./json-file-repository.js";
import { resolveMastraRuntimePaths } from "./paths.js";

const DAY_MS = 24 * 60 * 60 * 1_000;

/** 具体 Workflow run 的最小 interrupt 幂等回执，不表达审批业务状态。 */
export type WorkflowInterruptDecisionReceipt = {
  interruptId: string;
  idempotencyKey: string;
  decisionHash: string;
  createdAt: number;
  expiresAt: number;
};

/** 恢复 Mastra Workflow run 所需的非敏感编译与运行元数据。 */
export type StoredMastraWorkflowRun = {
  snapshot: WorkflowRunSnapshot;
  nativeRunId: string;
  runtimeWorkflowId: string;
  ir: WorkflowIR;
  agentDependencies?: AgentVersion[];
  targetNodeId?: string;
  nodeInputs?: Record<string, unknown>;
  ownerId?: string;
  interruptDecision?: WorkflowInterruptDecisionReceipt;
  retentionExpiresAt?: number;
};

type WorkflowRunEnvelope = {
  schemaVersion: 1;
  records: Record<string, StoredMastraWorkflowRun>;
};

function terminal(status: WorkflowRunSnapshot["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function assertIdentity(current: StoredMastraWorkflowRun, next: StoredMastraWorkflowRun): void {
  if (
    current.snapshot.workflowId !== next.snapshot.workflowId ||
    current.snapshot.versionId !== next.snapshot.versionId ||
    current.snapshot.contentHash !== next.snapshot.contentHash ||
    current.snapshot.mode !== next.snapshot.mode ||
    current.nativeRunId !== next.nativeRunId ||
    current.runtimeWorkflowId !== next.runtimeWorkflowId ||
    stableSerialize(current.agentDependencies ?? []) !== stableSerialize(next.agentDependencies ?? [])
  ) {
    throw new RuntimePortError(
      "RUNTIME_TERMINAL_CONFLICT",
      `Workflow run ${next.snapshot.id} 的运行绑定不可变。`,
    );
  }
}

/** 持久化 Workflow 产品快照和 Mastra 恢复身份，保持终态不可逆。 */
export class MastraWorkflowRunRepository {
  private readonly repository: JsonFileRepository<WorkflowRunEnvelope>;
  private readonly now: () => number;
  private readonly decisionTtlMs: number;
  private readonly terminalRetentionMs: number;

  constructor(options: {
    root?: string;
    persistenceEnabled?: boolean;
    now?: () => number;
    decisionTtlMs?: number;
    terminalRetentionMs?: number;
  } = {}) {
    const paths = resolveMastraRuntimePaths(options.root);
    this.now = options.now ?? Date.now;
    this.decisionTtlMs = options.decisionTtlMs ?? retentionDaysFor("session") * DAY_MS;
    this.terminalRetentionMs = options.terminalRetentionMs ?? retentionDaysFor("session") * DAY_MS;
    this.repository = new JsonFileRepository(
      path.join(paths.mappingsRoot, "workflow-runs.json"),
      () => ({ schemaVersion: 1, records: {} }),
      options.persistenceEnabled ?? isLocalPersistenceEnabled(),
    );
  }

  async create(record: StoredMastraWorkflowRun): Promise<StoredMastraWorkflowRun> {
    let stored: StoredMastraWorkflowRun | null = null;
    await this.repository.update((envelope) => {
      const current = envelope.records[record.snapshot.id];
      if (current) {
        assertIdentity(current, record);
        stored = current;
        return;
      }
      envelope.records[record.snapshot.id] = record;
      stored = record;
    });
    return stored!;
  }

  async update(record: StoredMastraWorkflowRun): Promise<StoredMastraWorkflowRun> {
    let stored: StoredMastraWorkflowRun | null = null;
    await this.repository.update((envelope) => {
      const current = envelope.records[record.snapshot.id];
      if (!current) throw new RuntimePortError("RUNTIME_NOT_FOUND", `Workflow run ${record.snapshot.id} 不存在。`);
      assertIdentity(current, record);
      if (terminal(current.snapshot.status)) {
        stored = current;
        return;
      }
      const next = terminal(record.snapshot.status) && record.retentionExpiresAt === undefined
        ? { ...record, retentionExpiresAt: this.now() + this.terminalRetentionMs }
        : record;
      envelope.records[record.snapshot.id] = next;
      stored = next;
    });
    return stored!;
  }

  async get(runId: string): Promise<StoredMastraWorkflowRun | null> {
    let result: StoredMastraWorkflowRun | null = null;
    const now = this.now();
    await this.repository.update((envelope) => {
      const record = envelope.records[runId];
      if (!record) return;
      if (record.retentionExpiresAt !== undefined && record.retentionExpiresAt <= now) {
        delete envelope.records[runId];
        return;
      }
      if (record.interruptDecision?.expiresAt !== undefined && record.interruptDecision.expiresAt <= now) {
        delete record.interruptDecision;
      }
      result = structuredClone(record);
    });
    return result;
  }

  /** 原子登记或比较同一 run 的 interrupt 决定。 */
  async claimInterruptDecision(input: {
    runId: string;
    interruptId: string;
    idempotencyKey: string;
    decisionHash: string;
  }): Promise<"claimed" | "replay" | "conflict"> {
    let outcome: "claimed" | "replay" | "conflict" = "conflict";
    const now = this.now();
    await this.repository.update((envelope) => {
      const record = envelope.records[input.runId];
      if (!record) throw new RuntimePortError("RUNTIME_NOT_FOUND", `Workflow run ${input.runId} 不存在。`);
      const current = record.interruptDecision;
      if (current && current.expiresAt > now) {
        const same = current.interruptId === input.interruptId
          && current.idempotencyKey === input.idempotencyKey
          && current.decisionHash === input.decisionHash;
        outcome = same && terminal(record.snapshot.status) ? "replay" : same ? "claimed" : "conflict";
        return;
      }
      record.interruptDecision = {
        interruptId: input.interruptId,
        idempotencyKey: input.idempotencyKey,
        decisionHash: input.decisionHash,
        createdAt: now,
        expiresAt: now + this.decisionTtlMs,
      };
      outcome = "claimed";
    });
    return outcome;
  }

  /** 删除达到终态 retention 的 run 技术记录，并返回需要联动清理的 runId。 */
  async cleanupExpired(): Promise<string[]> {
    const removed: string[] = [];
    const now = this.now();
    await this.repository.update((envelope) => {
      for (const [runId, record] of Object.entries(envelope.records)) {
        if (record.retentionExpiresAt !== undefined && record.retentionExpiresAt <= now) {
          delete envelope.records[runId];
          removed.push(runId);
          continue;
        }
        if (record.interruptDecision?.expiresAt !== undefined && record.interruptDecision.expiresAt <= now) {
          delete record.interruptDecision;
        }
      }
    });
    return removed;
  }
}
