## ADDED Requirements

### Requirement: Task board SHALL expose explicit claim and owner visibility

task board SHALL 提供显式 claim 工具，并在列表/详情输出中暴露 owner，以支持 multi-agent 任务分派与追踪。

#### Scenario: Coordinator claims a task

- **WHEN** 模型调用 `task_claim`
- **THEN** 系统 SHALL 将该 task 的 owner 设置为指定值
- **AND** task list/lookup SHALL 显示该 owner

#### Scenario: Task list shows ownership

- **WHEN** 用户或 coordinator 查询 task 列表
- **THEN** 输出 SHALL 含有 owner 可见性
- **AND** 未分配 task 与已 claim task SHALL 可区分

