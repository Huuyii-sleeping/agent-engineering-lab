# worktree-closeout-runtime Specification

## Purpose
定义 worktree 执行车道的进入、最近命令记录、统一收尾与脏改动保护契约，确保任务与 worktree 生命周期可以一致追踪与安全回收。

## Requirements
### Requirement: Worktree runtime SHALL record lane entry and recent command metadata
系统 SHALL 在 worktree 运行时持久化最近进入时间、最近命令时间和最近命令摘要，以便恢复“最后在哪条车道、最近做了什么”。

#### Scenario: 显式进入 worktree
- **WHEN** 调用 `worktree_enter` 成功进入某条 worktree 车道
- **THEN** 系统写入该 worktree 的 `last_entered_at`，并在任务记录中同步当前车道状态

#### Scenario: 在 worktree 中执行命令
- **WHEN** 调用 `worktree_run` 在 worktree 中执行命令
- **THEN** 系统写入 `last_command_at` 与截断后的 `last_command_preview`，并保留命令执行结果

### Requirement: Worktree closeout MUST be unified under a single runtime action
系统 MUST 提供统一的 `worktree_closeout` 运行时动作，使用显式 `action` 表达 `keep` 或 `remove`，并同步更新 worktree 记录、任务记录和事件日志。

#### Scenario: closeout 为 keep
- **WHEN** 调用 `worktree_closeout` 且 `action=keep`
- **THEN** 系统将 worktree 标记为 kept，并在 task 与 worktree 上写入一致的 closeout 结果

#### Scenario: closeout 为 remove
- **WHEN** 调用 `worktree_closeout` 且 `action=remove`
- **THEN** 系统移除对应 worktree 目录，更新 worktree 状态为 removed，并记录一致的 closeout 信息

### Requirement: Worktree removal MUST guard against dirty git changes by default
系统 MUST 在移除 git worktree 前检查脏改动；若存在未提交修改，则默认阻止回收，除非调用方显式提供强制确认。

#### Scenario: 存在脏改动时阻止移除
- **WHEN** `worktree_closeout(action=remove)` 或等价移除路径检测到 `git status --short` 非空
- **THEN** 系统返回结构化错误并提示保留或强制确认，而不是直接删除目录

#### Scenario: 强制移除脏 worktree
- **WHEN** 调用方显式传入 `force=true` 且选择 `action=remove`
- **THEN** 系统允许继续移除，并在 closeout 结果中标记此次回收为强制执行
