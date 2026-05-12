## ADDED Requirements

### Requirement: Background task boundary refactors MUST preserve async execution and notification semantics
后台任务内部边界重构 MUST 保持既有异步启动、状态查询、通知回流、输出截断和 observability 语义不变，同时允许这些职责分别由 runner 与 manager 承接。

#### Scenario: 保持异步启动与即时返回
- **WHEN** 模型调用 `background_run(command)`
- **THEN** background runner 与 manager 仍会即时返回 task id，而不是阻塞等待任务完成

#### Scenario: 保持状态查询与通知 drain 语义
- **WHEN** 模型调用 `check_background(task_id)` 或主循环 drain 后台通知
- **THEN** background manager 仍会返回既有 snapshot shape，并保持通知 drain 后清空队列

#### Scenario: 保持完成与失败 observability 语义
- **WHEN** 后台任务进入 `completed` 或 `failed`
- **THEN** background manager 仍会记录相同阶段的 observability 事件，并附带截断后的 stdout / stderr 摘要
