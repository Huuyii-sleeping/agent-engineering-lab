## ADDED Requirements

### Requirement: Agent loop SHALL inject relevant memory before model request
主循环在每轮模型请求前 SHALL 基于最新用户输入注入相关记忆上下文，并保持原有工具调用契约不变。

#### Scenario: 命中记忆时注入上下文
- **WHEN** 最新用户输入可命中记忆条目
- **THEN** 请求消息中追加 `memory_context` system 消息

