## ADDED Requirements

### Requirement: MCP fixture tests SHALL use explicit subprocess timeout budgets

MCP 本地 fixture 单元测试 SHALL 为真实启动 MCP fixture server、执行 JSON-RPC tool call、重连恢复或并发队列验证的用例设置显式 timeout 预算，避免依赖默认低预算。

#### Scenario: Full test suite runs MCP fixture tests under load
- **WHEN** `pnpm --dir apps/agent-cli test` 在全量并发测试环境中执行 MCP fixture 单测
- **THEN** MCP client 和 registry 的真实子进程测试使用显式 Vitest、startup 和 request timeout 预算
- **AND** 测试仍覆盖真实 fixture server、JSON-RPC tool call、auth failure cache、session-expired recovery 和 concurrency queue

#### Scenario: Production MCP timeout defaults remain unchanged
- **WHEN** MCP server config 未显式设置测试专用 timeout 预算
- **THEN** MCP client 继续使用运行时默认 startup timeout
- **AND** 生产 MCP client / registry 默认行为不发生变化
