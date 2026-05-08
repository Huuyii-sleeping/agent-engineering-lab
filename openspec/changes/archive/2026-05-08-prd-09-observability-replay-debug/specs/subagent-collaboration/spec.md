## ADDED Requirements

### Requirement: Subagent lifecycle notifications SHALL be observable
子代理的完成和失败通知 SHALL 写入统一观测事件流，以便通过 `trace_id` 或事件类型排查异步执行问题。

#### Scenario: 子代理完成写入事件
- **WHEN** 子代理状态变为 `completed`
- **THEN** 系统记录一条包含代理标识、状态与输出摘要的观测事件

#### Scenario: 子代理失败写入事件
- **WHEN** 子代理状态变为 `failed`
- **THEN** 系统记录一条包含代理标识、状态与错误摘要的观测事件
