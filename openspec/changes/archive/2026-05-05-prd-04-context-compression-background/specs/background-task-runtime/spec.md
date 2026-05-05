## ADDED Requirements

### Requirement: Agent SHALL provide asynchronous background command execution
系统 SHALL 提供 `background_run` 与 `check_background`，支持后台命令异步运行与状态查询。

#### Scenario: 启动后台任务
- **WHEN** 模型调用 `background_run(command)`
- **THEN** 系统立即返回 `taskId`，且不阻塞主循环

#### Scenario: 查询后台任务
- **WHEN** 模型调用 `check_background(task_id)`
- **THEN** 系统返回该任务当前状态与输出摘要

### Requirement: Background task completion MUST be fed back to main loop
后台任务完成或失败后 MUST 生成通知，并在主循环下一轮请求前注入摘要。

#### Scenario: 完成通知注入
- **WHEN** 后台任务状态由 `running` 变为 `completed`
- **THEN** 主循环下一轮自动注入完成摘要

#### Scenario: 失败通知注入
- **WHEN** 后台任务状态由 `running` 变为 `failed`
- **THEN** 主循环下一轮自动注入失败摘要
