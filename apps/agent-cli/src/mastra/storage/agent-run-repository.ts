import path from "node:path";
import { RuntimePortError, type AgentRunResult, type AgentRunSnapshot } from "@orbit/runtime-contracts";
import { isLocalPersistenceEnabled } from "../../runtime-config.js";
import { JsonFileRepository } from "./json-file-repository.js";
import { resolveMastraRuntimePaths } from "./paths.js";

type StoredAgentRun = AgentRunSnapshot | AgentRunResult;

type AgentRunEnvelope = {
  schemaVersion: 1;
  records: Record<string, StoredAgentRun>;
};

function isTerminal(status: AgentRunSnapshot["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function assertIdentity(current: AgentRunSnapshot, next: AgentRunSnapshot): void {
  if (
    current.sessionId !== next.sessionId ||
    current.resourceId !== next.resourceId ||
    current.threadId !== next.threadId ||
    current.binding.backend !== next.binding.backend ||
    current.binding.adapterVersion !== next.binding.adapterVersion ||
    current.binding.nativeRunId !== next.binding.nativeRunId
  ) {
    throw new RuntimePortError("RUNTIME_TERMINAL_CONFLICT", `Agent run ${next.id} 的运行绑定不可变。`);
  }
}

/** 持久化 Mastra Agent 产品快照，支持 run query 与终态不可逆。 */
export class MastraAgentRunRepository {
  private readonly repository: JsonFileRepository<AgentRunEnvelope>;

  constructor(options: { root?: string; persistenceEnabled?: boolean } = {}) {
    const paths = resolveMastraRuntimePaths(options.root);
    this.repository = new JsonFileRepository(
      path.join(paths.mappingsRoot, "agent-runs.json"),
      () => ({ schemaVersion: 1, records: {} }),
      options.persistenceEnabled ?? isLocalPersistenceEnabled(),
    );
  }

  async create(snapshot: AgentRunSnapshot): Promise<AgentRunSnapshot> {
    let result: AgentRunSnapshot | null = null;
    await this.repository.update((envelope) => {
      const current = envelope.records[snapshot.id];
      if (current) {
        assertIdentity(current, snapshot);
        result = current;
        return;
      }
      envelope.records[snapshot.id] = snapshot;
      result = snapshot;
    });
    return result!;
  }

  async finish(result: AgentRunResult): Promise<AgentRunResult> {
    let stored: AgentRunResult | null = null;
    await this.repository.update((envelope) => {
      const current = envelope.records[result.id];
      if (current) {
        assertIdentity(current, result);
        if (isTerminal(current.status)) {
          stored = current as AgentRunResult;
          return;
        }
      }
      envelope.records[result.id] = result;
      stored = result;
    });
    return stored!;
  }

  async get(runId: string): Promise<StoredAgentRun | null> {
    return (await this.repository.read()).records[runId] ?? null;
  }
}
