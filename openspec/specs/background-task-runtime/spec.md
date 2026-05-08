# background-task-runtime Specification

## Purpose
TBD - created by archiving change prd-04-context-compression-background. Update Purpose after archive.
## Requirements
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

### Requirement: Background task events SHALL be observable
后台任务的启动、完成和失败事件 SHALL 进入统一观测事件流，并附带任务标识、命令摘要和退出状态。

#### Scenario: 启动后台任务写入事件
- **WHEN** 模型调用 `background_run(command)`
- **THEN** 系统写入后台任务启动事件并记录 `taskId`

#### Scenario: 后台任务结束写入事件
- **WHEN** 后台任务状态变为 `completed` 或 `failed`
- **THEN** 系统写入包含退出码和输出摘要的观测事件
