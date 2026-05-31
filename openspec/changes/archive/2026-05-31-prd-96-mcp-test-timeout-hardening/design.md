## Context

MCP 单元测试使用真实 `tsx` fixture server 和 JSON-RPC 通信，能覆盖 client 初始化、tool listing、tool call、auth failure cache、session-expired recovery、concurrency limit 等关键路径。单独或定向执行时通常很快，但在 `pnpm --dir apps/agent-cli test` 的全量并发环境中，fixture 子进程启动和 IPC 调度偶发接近或超过 Vitest 默认 5s 用例超时。

PRD-90 已经对 delivery 的真实子进程测试设置显式超时，本轮沿用同一原则，只对 MCP 真实子进程测试设置局部超时预算，不调整生产逻辑。

## Goals / Non-Goals

**Goals:**

- MCP client / registry 单测在全量并发测试中拥有明确、稳定的超时预算。
- 保留真实 fixture server 和 JSON-RPC 覆盖。
- 保持测试失败仍然可见，避免全局放大所有测试超时。
- 不改变 MCP runtime、registry、client 或 tool execution 的生产语义。

**Non-Goals:**

- 不把 MCP fixture 改成 mock。
- 不优化 MCP fixture server 启动性能。
- 不改变 `requestTimeoutMs`、重试策略或远端 server 错误分类。
- 不解决所有可能的 CI 资源竞争问题。

## Decisions

### 决策 1：使用测试文件局部 timeout constant，而不是 Vitest 全局超时

- 方案：在 MCP client / registry 测试文件中定义 `MCP_SUBPROCESS_TEST_TIMEOUT_MS`，只给真实启动 fixture server 或运行远端 tool 的用例传入第三个 `it` 参数。
- 理由：问题来源是少数真实子进程 / IPC 测试；全局调高会让普通单测失败反馈变慢。
- 备选：调整 Vitest 全局 `testTimeout`。未采用，因为范围过大。

### 决策 2：不 mock MCP server

- 方案：继续使用现有 `test/fixtures/mcp-demo-server.ts`。
- 理由：当前测试的价值在于覆盖真实 JSON-RPC、server reconnect、auth cache、concurrency queue；mock 会降低回归价值。
- 备选：把 registry 测试改为内存 fake transport。未采用，因为这会绕开本轮要稳定的真实路径。

### 决策 3：增加可选 startup timeout 字段，但保持生产默认不变

- 方案：在 `McpServerConfig` 增加可选 `startupTimeoutMs`，`McpServerClient` 启动时使用 `config.startupTimeoutMs ?? RUNTIME_CONFIG.mcpStartupTimeoutMs`。测试 fixture 显式设置更高 startup / request timeout，生产配置未设置时默认值不变。
- 理由：全量并发下失败点可能发生在 initialize，也可能发生在 tool call；两者都属于测试 fixture 子进程预算，不应依赖默认低预算。
- 备选：只增加 Vitest timeout。未采用，因为已经观察到内部 initialize timeout 仍会失败。
- 备选：全局调高 `AGENT_MCP_STARTUP_TIMEOUT_MS` 或 Vitest 全局 timeout。未采用，因为范围过大。

## Risks / Trade-offs

- [Risk] 局部 timeout 变大后，真实死锁用例反馈更慢。→ Mitigation：只在 fixture 测试中设置，生产默认不变。
- [Risk] 后续新增 MCP 子进程测试忘记使用局部 timeout。→ Mitigation：在 spec 中明确 fixture 子进程测试必须设置显式预算。
- [Risk] 全量并发在极端低资源环境仍可能超时。→ Mitigation：本轮先解决本地可复现的默认 5s 过低问题，后续若出现稳定 CI 慢环境再单独收口。
