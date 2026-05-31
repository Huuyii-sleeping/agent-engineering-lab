## Why

全量执行 `apps/agent-cli` 单测时，MCP 相关测试需要启动本地 fixture server 并通过 JSON-RPC 通信，在并发测试压力下偶发超过 Vitest 默认 5s 用例超时。该问题不会改变生产 MCP 行为，但会降低本地生产级验收的可信度，尤其是在 PRD-95 已经把 harness 作为后续基础能力门禁后，需要先收掉这类验证噪音。

## What Changes

In Scope:
- 为 MCP 子进程 / registry 单元测试设置明确的测试超时预算，覆盖 Vitest 用例 timeout、fixture startup timeout 和 JSON-RPC request timeout。
- 保留现有真实 fixture server 覆盖，不用 mock 替代 MCP client / registry 通信链路。
- 补充 OpenSpec 规范，说明 MCP 本地 fixture 测试需要具备稳定超时预算。
- 执行 MCP 定向测试、`apps/agent-cli` 全量单测、`pnpm build` 和 OpenSpec 校验。

Out of Scope:
- 不改变 MCP registry、client、tool call、auth recovery 或 concurrency 的生产默认逻辑。
- 不降低测试覆盖，不删除真实子进程 fixture。
- 不调整 Vitest 全局超时配置，避免影响其他测试的失败反馈速度。
- 不处理远端 MCP server 的网络稳定性或重试策略。

## Capabilities

### New Capabilities

### Modified Capabilities
- `mcp-external-capability-bus`: MCP 本地 fixture 单测应为真实子进程 / JSON-RPC 流程设置显式超时预算，保证全量并发测试下稳定运行。

## Impact

- 影响 `apps/agent-cli/src/tools/mcp-config.ts` 与 `apps/agent-cli/src/tools/mcp-client.ts`，为测试和显式配置提供可选 startup timeout 字段，默认值不变。
- 影响 `apps/agent-cli/test/unit/tools/mcp-client.test.ts`。
- 影响 `apps/agent-cli/test/unit/tools/mcp-registry.test.ts`。
- 影响 `openspec/specs/mcp-external-capability-bus/spec.md`。
- 不新增依赖，不改变 runtime API，不改变生产 MCP 行为。
