## ADDED Requirements

### Requirement: Agent loop SHALL assign trace context for each round
主循环在每轮模型请求前 SHALL 分配 `trace_id`，并将该上下文贯穿本轮工具调用与通知事件。

#### Scenario: 单轮内共享同一 trace
- **WHEN** 主循环进入一次新的模型请求轮次
- **THEN** 该轮产生的工具调用与观测事件共享同一个 `trace_id`

### Requirement: Agent loop SHALL record replay-safe request metadata
主循环 SHALL 记录回放所需的最小元数据，包括轮次编号、最新用户输入摘要和 token 估算，但不得要求完整重放模型原文响应。

#### Scenario: 请求元数据写入事件流
- **WHEN** 主循环发起模型请求
- **THEN** 观测事件中包含本轮编号、用户输入摘要和 token 估算字段
