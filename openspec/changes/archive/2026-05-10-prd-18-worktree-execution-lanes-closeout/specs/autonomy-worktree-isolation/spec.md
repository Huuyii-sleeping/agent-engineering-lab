## MODIFIED Requirements

### Requirement: Worktree lifecycle SHALL be fully manageable
系统 SHALL 提供工作树全生命周期管理，并记录事件日志、最近进入时间、最近命令摘要和最终收尾结果。

#### Scenario: 创建并进入工作树
- **WHEN** 调用 worktree create 后再调用 `worktree_enter`
- **THEN** 系统创建隔离目录，并在对应记录中写入最近进入时间

#### Scenario: 在工作树中运行命令
- **WHEN** 调用 `worktree_run`
- **THEN** 系统更新最近命令时间与命令摘要，并保留执行输出

#### Scenario: 统一收尾工作树
- **WHEN** 调用 `worktree_closeout`
- **THEN** 系统按 `keep` 或 `remove` 分支更新工作树状态，并记录一致的生命周期事件

### Requirement: Worktree and tasks MUST support binding
任务与工作树 MUST 支持绑定形成闭环追踪，并在任务记录中保留当前车道、最近车道和收尾状态。

#### Scenario: 绑定任务到工作树
- **WHEN** 调用 task-worktree bind 或等价更新路径
- **THEN** 任务记录写入对应 worktree 标识，并将最近车道同步为该 worktree

#### Scenario: 进入已绑定工作树
- **WHEN** 调用 `worktree_enter` 且该 worktree 对应某个任务
- **THEN** 任务记录更新 `worktree_state` 为 entered 或等价运行态，并保留 `last_worktree`

#### Scenario: closeout 后同步任务记录
- **WHEN** 调用 `worktree_closeout`
- **THEN** 任务记录中的 `closeout`、`worktree_state` 与最近车道信息与 worktree 收尾结果保持一致
