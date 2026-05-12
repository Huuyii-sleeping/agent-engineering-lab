# TaskBoard 任务模块边界收口

## 这次真正学到的东西

### 1. task-board 不是一个“小工具”，而是一块状态面

`tools/task-board.ts` 原来同时负责：

- task tool schema
- `.tasks/task_*.json` 持久化
- 兼容读取与字段归一化
- status transition 与 blockedBy 清理
- unclaimed scan 与 claim
- worktree state / closeout 回写
- public handlers

这说明它本质上不是一个简单 facade，而是任务状态面。继续把这些逻辑堆在一个文件里，后续无论是改 task lifecycle、改 autonomy claim，还是改 worktree 同步，都很容易顺手碰到 tool schema 和对外契约。

### 2. task 的自然边界是 store / manager / facade

这一轮拆完之后，边界变得更清楚：

- `task-types.ts`
  - 放共享类型、schema version、normalize helper 和错误输出 helper
- `task-store.ts`
  - 负责 `.tasks` 初始化、task 文件读写、兼容归一化、全量加载和依赖清理
- `task-manager.ts`
  - 负责 create / get / list / update / scan / claim / worktree sync 编排
- `task-board.ts`
  - 只保留 tool schema、默认 manager 实例和 `runTask*` 导出

这和前几轮 `team`、`worktree`、`security` 的收口方式已经统一了。

## 放到本仓库里怎么看

### 当前已经有的基础

- `task-visualization-persistence` spec 已经定义了任务持久化、状态机和 worktree 绑定语义
- `autonomy-worktree-isolation` spec 已经定义了 unclaimed scan、claim 和 worktree 生命周期联动
- `PRD-18` smoke 已经覆盖 task 与 worktree 的端到端联动

### 当前最明显的差距

- `task-board.ts` 仍然是 400+ 行的大文件
- task persistence、claim、worktree sync 没有独立 focused tests
- `autonomy.ts` 和 `worktree-manager.ts` 虽然调用的是稳定入口，但入口背后还是单文件聚合

### 这轮只解决哪些差距

- 这轮要做的：拆 `TaskBoard` 内部边界，补 focused tests，沉淀文档
- 这轮不做的：不改任务状态机，不改 claim lock，不改 worktree sync 语义，不把 task 能力迁移到 `services/`

## 这轮采纳了什么

### 采纳

- 新增 `task-types.ts`

集中放：

- `TaskStatus` / `WorktreeState` / `TaskCloseout` / `Task`
- `TASK_SCHEMA_VERSION`
- `normalizeWorktreeState`
- `normalizeTaskCloseout`
- `toTaskError`

- 新增 `task-store.ts`

承接持久化边界：

- `.tasks` 初始化
- task 文件 load / save
- 兼容归一化
- `allTasks`
- `clearDependency`
- id 分配

- 新增 `task-manager.ts`

承接运行时编排：

- `create`
- `get`
- `listAll`
- `update`
- `scanUnclaimedTasks`
- `claimTask`
- `syncWorktreeState`

- 收窄 `task-board.ts`

现在 `task-board.ts` 只保留：

- `TASK_TOOLS`
- 默认 `TaskManager` 实例
- `runTask*` facade

- 新增 focused tests

覆盖：

- legacy task 兼容读取
- blockedBy 清理
- claim 冲突
- worktree state / closeout 同步

### 暂不采纳

- 暂不继续拆 claim lock

`withClaimLock` 现在还留在 `autonomy.ts`。这轮先把 task board 本体拆清，再决定 claim coordination 是否应提升为独立 runtime/service 边界。

- 暂不把 task sync 移到 `services/`

当前 task sync 仍然是 tools 层稳定入口，`worktree-manager.ts` 继续调用 `runTaskSyncWorktreeState`。是否进一步升级成 runtime service，应该和 task lifecycle 的下一轮收口一起评估。

## 这轮实际改成了什么

- `task-types.ts` 承接共享类型与 normalize helper
- `task-store.ts` 承接任务持久化与依赖清理
- `task-manager.ts` 承接状态迁移、claim 与 worktree sync
- `task-board.ts` 收成 tool schema 与 public handler facade
- 新增 `task-store.test.ts` 与 `task-manager.test.ts`

改完之后，后续变更入口更明确：

- 调整 `.tasks` 文件兼容与依赖清理，优先改 `task-store.ts`
- 调整任务状态机、claim 或 worktree sync，优先改 `task-manager.ts`
- 调整 tool schema 或 public handler，再改 `task-board.ts`

## 下一步最自然的动作

1. 继续检查 `scheduler.ts` 与 `background-task.ts`，它们也还是偏重的状态聚合文件。
2. 评估 `autonomy.ts` 里的 claim lock 是否要抬成单独 coordination 边界。
3. 评估 task lifecycle 是否应进一步从 tools 层提升到 runtime service。
