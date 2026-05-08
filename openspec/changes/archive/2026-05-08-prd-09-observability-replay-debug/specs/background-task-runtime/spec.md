## ADDED Requirements

### Requirement: Background task events SHALL be observable
后台任务的启动、完成和失败事件 SHALL 进入统一观测事件流，并附带任务标识、命令摘要和退出状态。

#### Scenario: 启动后台任务写入事件
- **WHEN** 模型调用 `background_run(command)`
- **THEN** 系统写入后台任务启动事件并记录 `taskId`

#### Scenario: 后台任务结束写入事件
- **WHEN** 后台任务状态变为 `completed` 或 `failed`
- **THEN** 系统写入包含退出码和输出摘要的观测事件
