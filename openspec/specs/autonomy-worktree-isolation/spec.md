# autonomy-worktree-isolation Specification

## Purpose
定义自治轮询、任务认领和 worktree 生命周期管理的基础契约，确保任务可以在隔离执行车道中被稳定认领、运行、收尾与追踪。

## Requirements
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
系统 SHALL 提供工作树全生命周期管理，并记录事件日志、最近进入时间、最近命令摘要和最终收尾结果。

#### Scenario: 创建并进入工作树
- **WHEN** 调用 `worktree_create` 后再调用 `worktree_enter`
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

### Requirement: Autonomy and worktree runtime SHALL use configurable operational constants
自治轮询与 worktree 相关运行参数 MUST 通过统一配置入口读取，并保持与既有行为兼容。

#### Scenario: 自治参数默认值可用
- **WHEN** 未设置自治相关环境变量
- **THEN** 系统使用默认轮询间隔与空闲超时，行为稳定

#### Scenario: 自治参数可配置
- **WHEN** 设置自治相关环境变量
- **THEN** 新参数立即生效，无需修改源代码
