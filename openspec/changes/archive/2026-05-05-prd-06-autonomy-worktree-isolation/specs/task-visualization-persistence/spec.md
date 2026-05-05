## MODIFIED Requirements

### Requirement: Agent SHALL persist task board across sessions
系统 MUST 支持为任务记录 `worktree` 绑定字段，并在任务查询与列表中返回该信息。

#### Scenario: 任务绑定工作树后可持久化读取
- **WHEN** 任务绑定了 worktree
- **THEN** 重启后 `task_get/task_list` 仍返回对应 worktree 信息
