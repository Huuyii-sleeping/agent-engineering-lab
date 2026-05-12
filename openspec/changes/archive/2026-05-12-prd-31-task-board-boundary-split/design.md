## Context

当前 `tools/task-board.ts` 同时负责：

- task tool schemas
- `.tasks/task_*.json` 初始化、读取、归一化和保存
- 状态迁移与 blockedBy 清理
- unclaimed task 扫描与 claim
- task 与 worktree 的状态同步
- public run handlers

这使 task persistence、autonomy claim 和 worktree 联动都耦合在同一个文件里。考虑到前几轮已经把 worktree、team、security 等模块拆成 store / manager / facade 边界，task-board 继续维持聚合状态，会让后续调整任务状态机、claim lock 协作或 worktree 同步时更容易误触 tool facade。

## Goals / Non-Goals

**Goals:**

- 拆出 task types / helper 边界。
- 拆出 task store 边界，集中处理持久化、兼容归一化和依赖清理。
- 拆出 task manager 边界，集中处理状态迁移、claim 和 worktree sync。
- 让 `tools/task-board.ts` 只保留 tool schema 与 public handler facade。
- 保持现有任务行为兼容。

**Non-Goals:**

- 不改变 `TASK_TOOLS`、`runTask*` 系列导出或错误输出 shape。
- 不改变 `claimTask`、`scanUnclaimedTasks`、`runTaskSyncWorktreeState` 的语义。
- 不改变 `.tasks/task_*.json` 格式或 schema version 规则。
- 不把 task 模块迁移到 `services/`。

## Decisions

### Decision 1: 新增 `task-types.ts`

采纳：

- 集中 `TaskStatus`、`WorktreeState`、`TaskCloseout`、`Task` 类型。
- 集中 `TASK_SCHEMA_VERSION`、closeout / worktree state normalize 与错误输出 helper。

备选方案：

- 继续把类型和 helper 留在 `task-board.ts`。

不采用原因：

- store、manager 与 facade 都需要共享这些 shape；继续散落会延续单文件聚合。

### Decision 2: 新增 `task-store.ts`

采纳：

- store 负责目录初始化、任务文件读写、兼容归一化、全量加载和依赖清理。
- `clearDependency` 仍留在 store 边界，因为它本质上是跨任务持久化更新。

备选方案：

- 让 manager 直接读写磁盘并顺带做依赖清理。

不采用原因：

- manager 应侧重流程编排；把磁盘和归一化逻辑留在 store 才方便 focused tests 和后续调整。

### Decision 3: 新增 `task-manager.ts`

采纳：

- manager 负责 create / get / list / update / scan / claim / worktree sync。
- manager 持有 store，并维持现有状态机、claim 和 worktree 同步语义。

备选方案：

- 进一步拆成 claim manager 与 worktree sync manager。

不采用原因：

- 这一轮目标是先把 task-board 从单文件拆成稳定的一层 manager，不做过度细分。

### Decision 4: `tools/task-board.ts` 退成 facade

采纳：

- `tools/task-board.ts` 只保留 `TASK_TOOLS`、默认 `TaskManager` 实例和 `runTask*` 导出。

备选方案：

- 保持 `TaskManager` 定义留在 `task-board.ts`，只抽 store。

不采用原因：

- 这会让 claim、sync 和状态机仍然堆在 facade 中，收口收益有限。

## Risks / Trade-offs

- [Risk] 兼容读取旧任务文件时默认值变化 -> Mitigation：为 normalize、list 输出和 schema version 补 focused tests。
- [Risk] 状态迁移后 blockedBy 清理顺序变化 -> Mitigation：对 completed transition 与依赖清理补 focused tests。
- [Risk] worktree sync 或 claim 语义漂移 -> Mitigation：保留现有 manager 编排顺序，并复用 PRD-18 / PRD-13 smoke。

