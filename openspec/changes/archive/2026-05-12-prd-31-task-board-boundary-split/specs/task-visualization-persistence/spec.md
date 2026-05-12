## ADDED Requirements

### Requirement: Task board internals MUST preserve persistence semantics across boundary refactors
任务面板内部边界重构 MUST 保持既有任务持久化、schema version 兼容、状态迁移与 worktree 字段回写语义不变，同时允许这些职责分别由 store 与 manager 承接。

#### Scenario: 兼容读取旧任务文件
- **WHEN** 系统读取缺少 `schemaVersion` 或缺少新字段的旧任务文件
- **THEN** task store 仍会补齐兼容默认值，并通过 `task_get/task_list` 返回一致的任务信息

#### Scenario: 任务状态迁移后清理依赖
- **WHEN** 任务从非 completed 迁移到 `completed`
- **THEN** task manager 会保持现有状态机约束，并清理其他任务对该任务的 blockedBy 依赖

#### Scenario: worktree 状态同步回写任务
- **WHEN** worktree 生命周期事件触发 task worktree state 同步
- **THEN** task manager 会保持 `worktree`、`worktree_state`、`last_worktree` 与 `closeout` 的既有回写语义
