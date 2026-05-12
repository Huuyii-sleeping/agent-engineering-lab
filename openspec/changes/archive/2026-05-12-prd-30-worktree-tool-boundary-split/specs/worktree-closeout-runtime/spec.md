## ADDED Requirements

### Requirement: Worktree boundary corrections MUST preserve closeout dirty guard and task sync semantics
Worktree 边界校正 MUST 保持 create、enter、run、closeout、dirty guard 与 task sync 的现有语义不变。

#### Scenario: 执行 worktree lifecycle
- **WHEN** 模型调用 `worktree_create`、`worktree_enter`、`worktree_run` 和 `worktree_closeout`
- **THEN** 系统继续写入同样的 worktree record、event log、recent command metadata 和 task worktree state

#### Scenario: 移除 dirty worktree
- **WHEN** `worktree_remove` 或 `worktree_closeout(action=remove)` 检测到 dirty git files 且未设置 `force=true`
- **THEN** 系统继续返回 `DIRTY_WORKTREE` 结构化错误和 `dirtyFiles`

#### Scenario: 强制移除 dirty worktree
- **WHEN** 调用方设置 `force=true`
- **THEN** 系统继续允许移除并在 closeout 结果中记录 `forced=true`
