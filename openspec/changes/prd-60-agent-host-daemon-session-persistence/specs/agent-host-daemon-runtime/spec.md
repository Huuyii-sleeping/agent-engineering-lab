## ADDED Requirements

### Requirement: Agent runtime SHALL expose a long-lived host boundary
系统 SHALL 提供长期存在的 `AgentHost` 宿主边界，用于统一承载 runtime services、query engine、session registry 与事件流，而不是让各个入口各自独立装配运行时。

#### Scenario: 多入口复用同一宿主
- **WHEN** CLI、TUI、HTTP service 或 MCP server 需要访问 Agent 运行时能力
- **THEN** 它们通过共享的 `AgentHost` 访问 session、chat 与事件能力

### Requirement: Agent CLI SHALL support daemon mode
系统 SHALL 提供 `daemon` 运行模式，使 `agent-cli` 可以作为后台长期驻留进程运行，而不是仅限一次性前台执行。

#### Scenario: 启动 daemon
- **WHEN** 用户以 `daemon` 模式启动 `agent-cli`
- **THEN** 系统启动长期存在的 `AgentHost` 并保持进程存活，直到显式关闭

### Requirement: Long-lived host mode MUST preserve existing runtime contracts
长期宿主模式 MUST 保持现有 query、tool 和 session API 的外部契约一致，不得因为宿主化改造改变既有 chat / tool 调用语义。

#### Scenario: 宿主化后调用 chat
- **WHEN** 外部调用方通过共享宿主发起 chat
- **THEN** 系统继续返回与现有契约兼容的 assistant 结果、session summary 和错误形状
