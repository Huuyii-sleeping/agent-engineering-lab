# task-visualization-persistence Specification

## Purpose
TBD - created by archiving change prd-02-task-visualization-persistence. Update Purpose after archive.
## Requirements
### Requirement: Agent SHALL provide todo visualization with strict status constraints
系统 SHALL 提供 `todo(items)` 工具，用于维护会话内任务列表并可视化输出状态。

#### Scenario: 渲染任务状态
- **WHEN** 模型调用 `todo(items)` 且输入合法
- **THEN** 系统返回包含 `[ ]`、`[>]`、`[x]` 标记的任务列表与完成计数

#### Scenario: 限制 in_progress 数量
- **WHEN** 模型提交超过 1 条 `in_progress` 状态任务
- **THEN** 系统拒绝更新并返回明确错误

#### Scenario: 限制任务总数
- **WHEN** 模型提交超过 20 条 todo
- **THEN** 系统拒绝更新并返回明确错误

### Requirement: Agent MUST inject todo reminder after three rounds without todo
系统 MUST 在连续 3 轮未调用 `todo` 时注入提醒消息，提示模型更新任务计划。

#### Scenario: 达到提醒阈值
- **WHEN** 连续 3 轮工具调用中均未出现 `todo`
- **THEN** 下一轮模型请求前附加提醒消息

#### Scenario: 调用 todo 后重置计数
- **WHEN** 任意轮调用了 `todo`
- **THEN** 未调用计数重置为 0

### Requirement: Agent SHALL persist task board across sessions
系统 SHALL 提供 `task_create/task_update/task_list/task_get`，并将任务持久化到 `.tasks/task_<id>.json`。

#### Scenario: 创建任务后重启仍可读取
- **WHEN** 创建任务并重启进程
- **THEN** `task_list` 与 `task_get` 可读取到已有任务

#### Scenario: 完成任务自动清理依赖
- **WHEN** 任务 A 状态更新为 `completed`
- **THEN** 其他任务 `blockedBy` 中的 A 自动移除并持久化写回

