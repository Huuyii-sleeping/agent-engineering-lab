import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { retentionDaysFor } from "../../security/local-retention.js";

export const MASTRA_STORAGE_NAMESPACE = "v1";

/** Mastra 数据、映射和产品事件的版本化本地路径。 */
export type MastraRuntimePaths = {
  projectRoot: string;
  runtimeRoot: string;
  root: string;
  databasePath: string;
  databaseUrl: string;
  mappingsRoot: string;
  eventsRoot: string;
  metadataPath: string;
};

/** 将 Mastra 数据固定在现有 .runtime 根目录的版本化 namespace 下。 */
export function resolveMastraRuntimePaths(projectRoot = process.cwd()): MastraRuntimePaths {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const runtimeRoot = path.join(resolvedProjectRoot, ".runtime");
  const root = path.join(runtimeRoot, "mastra", MASTRA_STORAGE_NAMESPACE);
  const databasePath = path.join(root, "mastra.db");
  return {
    projectRoot: resolvedProjectRoot,
    runtimeRoot,
    root,
    databasePath,
    databaseUrl: `file:${databasePath}`,
    mappingsRoot: path.join(root, "mappings"),
    eventsRoot: path.join(root, "events"),
    metadataPath: path.join(root, "runtime-metadata.json"),
  };
}

/** 创建 Mastra runtime 所需目录，并记录与 session 一致的保留策略元数据。 */
export async function ensureMastraRuntimePaths(paths: MastraRuntimePaths): Promise<void> {
  await Promise.all([
    mkdir(paths.mappingsRoot, { recursive: true }),
    mkdir(path.join(paths.eventsRoot, "agent"), { recursive: true }),
    mkdir(path.join(paths.eventsRoot, "workflow"), { recursive: true }),
  ]);
  const exists = await access(paths.metadataPath).then(() => true, () => false);
  if (!exists) {
    const createdAt = Date.now();
    await writeFile(paths.metadataPath, `${JSON.stringify({
      schemaVersion: 1,
      namespace: MASTRA_STORAGE_NAMESPACE,
      createdAt,
      retentionClass: "protected_runtime_state",
      retentionDays: retentionDaysFor("session"),
      deleteMode: "explicit_delete",
    }, null, 2)}\n`, "utf8");
  }
}

/** 显式删除当前版本的 Mastra runtime 数据；调用方须先完成实例 shutdown。 */
export async function cleanupMastraRuntimeData(options: { root?: string } = {}): Promise<void> {
  await rm(resolveMastraRuntimePaths(options.root).root, { recursive: true, force: true });
}
