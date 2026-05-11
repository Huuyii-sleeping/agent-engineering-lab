## ADDED Requirements

### Requirement: Agent loop context tools SHALL support session-scoped runtime binding
主循环中依赖运行时消息上下文的工具 SHALL 支持按当前执行作用域读取 session 绑定的上下文，而不是从全局共享状态读取。

#### Scenario: 不同执行作用域读取各自上下文
- **WHEN** CLI 或 HTTP service 在不同 session 中进入 `agentLoop`
- **THEN** `estimate_tokens` 与 `compact` 仅读取当前 session 绑定的消息上下文
