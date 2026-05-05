## ADDED Requirements

### Requirement: Agent SHALL support autonomous idle polling and task claiming
系统 SHALL 在 idle 阶段执行轮询，扫描未认领任务并尝试认领执行。

#### Scenario: idle 轮询认领任务
- **WHEN** 队友状态为 idle 且存在未认领任务
- **THEN** 系统触发 `scanUnclaimedTasks` 并执行 `claimTask`

#### Scenario: 空闲超时安全关停
- **WHEN** 连续空闲超过 60000ms
- **THEN** 系统进入安全关停状态

### Requirement: Claim operations MUST be lock-protected
任务认领 MUST 在串行锁保护下执行，防止重复认领。

#### Scenario: 并发认领同一任务
- **WHEN** 多个流程同时尝试认领同一任务
- **THEN** 仅一个流程成功，其他流程得到已认领结果

### Requirement: Worktree lifecycle SHALL be fully manageable
系统 SHALL 提供工作树全生命周期管理，并记录事件日志。

#### Scenario: 创建并运行工作树
- **WHEN** 调用 worktree create 后调用 run
- **THEN** 系统创建隔离目录并在其中执行命令

#### Scenario: 删除工作树
- **WHEN** 调用 worktree remove
- **THEN** 系统移除工作树并更新索引

### Requirement: Worktree and tasks MUST support binding
任务与工作树 MUST 支持绑定形成闭环追踪。

#### Scenario: 绑定任务到工作树
- **WHEN** 调用 task-worktree bind
- **THEN** 任务记录写入对应 worktree 标识
