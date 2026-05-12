# task-visualization-persistence Specification

## Purpose
定义会话内 todo 可视化与会话外任务持久化能力，保证任务状态可追踪、可恢复、可绑定工作树，并通过提醒机制推动模型维护当前计划。
## Requirements
### Requirement: Agent SHALL provide todo visualization with strict status constraints
系统 SHALL 提供 `todo(items)` 工具，用于维护会话内任务列表并可视化输出状态。

#### Scenario: 渲染任务状态
- **WHEN** 模型调用 `todo(items)` 且输入合法
- **THEN** 系统返回包含 `[ ]`、`[>]`、`[x]` 标记的任务列表与完成计数

#### Scenario: 限制 in_progress 数量
- **WHEN** 模型提交超过 1 条 `in_progress` 状态任务
- **THEN** 系统拒绝更新并返回明确错误

#### Scenario: 限制任务总数
- **WHEN** 模型提交超过 20 条 todo
- **THEN** 系统拒绝更新并返回明确错误

### Requirement: Agent MUST inject todo reminder after three rounds without todo
系统 MUST 在连续 3 轮未调用 `todo` 时注入提醒消息，提示模型更新任务计划。

#### Scenario: 达到提醒阈值
- **WHEN** 连续 3 轮工具调用中均未出现 `todo`
- **THEN** 下一轮模型请求前附加提醒消息

#### Scenario: 调用 todo 后重置计数
- **WHEN** 任意轮调用了 `todo`
- **THEN** 未调用计数重置为 0

### Requirement: Agent SHALL persist task board across sessions
系统 MUST 支持为任务记录 `worktree` 绑定字段，并在任务查询与列表中返回该信息。

#### Scenario: 任务绑定工作树后可持久化读取
- **WHEN** 任务绑定了 worktree
- **THEN** 重启后 `task_get/task_list` 仍返回对应 worktree 信息

### Requirement: Task persistence SHALL include schema version and guarded transitions
任务持久化记录 MUST 包含 `schemaVersion` 字段；系统 MUST 对任务状态转移执行守卫并拒绝非法跳转。

#### Scenario: 读取旧版本任务文件
- **WHEN** 任务文件缺少 `schemaVersion`
- **THEN** 系统仍可读取并提供兼容默认值

#### Scenario: 拒绝非法状态跳转
- **WHEN** 已完成任务尝试变更为非 `completed`
- **THEN** 系统返回结构化错误，错误码为 `INVALID_STATUS_TRANSITION`

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

