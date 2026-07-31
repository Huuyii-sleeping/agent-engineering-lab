import path from "node:path";
import { Mastra } from "@mastra/core/mastra";
import { ConsoleLogger, LogLevel } from "@mastra/core/logger";
import { NoOpObservability } from "@mastra/core/observability";
import { LibSQLStore } from "@mastra/libsql";
import { isLocalPersistenceEnabled } from "../../runtime-config.js";
import { MASTRA_AGENT_REGISTRY } from "../agents/index.js";
import { createOrbitMastraMemory, ORBIT_MASTRA_MEMORY_KEY } from "../memory/index.js";
import { ensureMastraRuntimePaths, resolveMastraRuntimePaths, type MastraRuntimePaths } from "../storage/paths.js";
import { MASTRA_TOOL_REGISTRY } from "../tools/index.js";
import { MASTRA_WORKFLOW_REGISTRY } from "../workflows/index.js";

export type SharedMastraRuntime = {
  mastra: Mastra;
  storage: LibSQLStore;
  memory: ReturnType<typeof createOrbitMastraMemory>;
  paths: MastraRuntimePaths;
  persistenceEnabled: boolean;
};

type MastraRuntimeOptions = {
  root?: string;
  persistenceEnabled?: boolean;
};

const runtimes = new Map<string, Promise<SharedMastraRuntime>>();

function runtimeKey(options: MastraRuntimeOptions): string {
  return `${path.resolve(options.root ?? process.cwd())}:${options.persistenceEnabled ?? isLocalPersistenceEnabled()}`;
}

/** 创建或复用进程级共享 Mastra Instance。 */
export function getOrCreateMastraRuntime(options: MastraRuntimeOptions = {}): Promise<SharedMastraRuntime> {
  const key = runtimeKey(options);
  const current = runtimes.get(key);
  if (current) return current;
  const created = createMastraRuntime(options).catch((error) => {
    runtimes.delete(key);
    throw error;
  });
  runtimes.set(key, created);
  return created;
}

/** 关闭指定 namespace 的共享实例，并允许后续重新创建。 */
export async function shutdownMastraRuntime(options: MastraRuntimeOptions = {}): Promise<void> {
  const key = runtimeKey(options);
  const current = runtimes.get(key);
  if (!current) return;
  runtimes.delete(key);
  const runtime = await current;
  await runtime.mastra.shutdown();
}

async function createMastraRuntime(options: MastraRuntimeOptions): Promise<SharedMastraRuntime> {
  const paths = resolveMastraRuntimePaths(options.root);
  const persistenceEnabled = options.persistenceEnabled ?? isLocalPersistenceEnabled();
  if (persistenceEnabled) await ensureMastraRuntimePaths(paths);
  const storage = new LibSQLStore({
    id: "orbit-mastra-storage-v1",
    url: persistenceEnabled ? paths.databaseUrl : ":memory:",
  });
  await storage.init();
  const memory = createOrbitMastraMemory(storage);
  const mastra = new Mastra({
    agents: MASTRA_AGENT_REGISTRY,
    workflows: MASTRA_WORKFLOW_REGISTRY,
    tools: MASTRA_TOOL_REGISTRY,
    memory: { [ORBIT_MASTRA_MEMORY_KEY]: memory },
    storage,
    logger: new ConsoleLogger({ name: "orbit-agent-runtime", level: LogLevel.WARN }),
    observability: new NoOpObservability(),
  });
  return { mastra, storage, memory, paths, persistenceEnabled };
}
