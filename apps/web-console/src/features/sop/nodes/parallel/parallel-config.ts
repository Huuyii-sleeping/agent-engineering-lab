import type { ParallelBranch, ParallelNodeConfig } from "@orbit/workflow-core";

const branchId = () => `branch-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;

/** 追加分支时生成一次稳定 id；后续改名不会重写该 id。 */
export function appendParallelBranch(config: ParallelNodeConfig, createId: () => string = branchId): ParallelNodeConfig {
  let id = createId();
  while (config.branches.some((branch) => branch.id === id)) id = createId();
  return {
    ...config,
    branches: [...config.branches, { id, label: `分支 ${config.branches.length + 1}` }],
  };
}

/** 仅更新分支展示名，保持分支 id 和端口 identity 不变。 */
export function renameParallelBranch(config: ParallelNodeConfig, id: string, label: string): ParallelNodeConfig {
  return { ...config, branches: config.branches.map((branch) => branch.id === id ? { ...branch, label } : branch) };
}

/** Parallel 至少保留两个分支，避免编辑器制造已知无效配置。 */
export function removeParallelBranch(config: ParallelNodeConfig, id: string): ParallelNodeConfig {
  if (config.branches.length <= 2) return config;
  return { ...config, branches: config.branches.filter((branch) => branch.id !== id) };
}

/** 为测试和 UI 暴露分支的只读稳定 identity。 */
export function listParallelBranchIds(branches: readonly ParallelBranch[]): string[] {
  return branches.map((branch) => branch.id);
}
