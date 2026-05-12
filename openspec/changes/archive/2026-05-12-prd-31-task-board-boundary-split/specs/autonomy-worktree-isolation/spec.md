## ADDED Requirements

### Requirement: Task claim and worktree sync boundaries MUST remain stable after task board consolidation
任务认领与 worktree 同步相关能力在 task-board 边界收口后 MUST 保持原有锁保护、认领语义和 worktree 联动语义，并由独立 manager 统一承接。

#### Scenario: autonomy 轮询继续复用 task claim 能力
- **WHEN** autonomy idle poll 扫描未认领任务并尝试认领
- **THEN** 调用方仍通过稳定的 task claim 入口完成扫描与认领，而不是自行读写任务文件

#### Scenario: worktree manager 继续复用 task sync 能力
- **WHEN** worktree manager 在 enter、run 或 closeout 后同步任务状态
- **THEN** 调用方仍通过稳定的 task worktree sync 入口更新任务，而不是直接修改 `.tasks` 持久化文件
