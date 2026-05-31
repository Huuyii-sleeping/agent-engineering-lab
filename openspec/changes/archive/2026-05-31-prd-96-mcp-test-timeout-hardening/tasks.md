## 1. 测试稳定性实现

- [x] 1.1 为 `mcp-client.test.ts` 中真实 fixture server 用例增加局部 Vitest timeout constant。
- [x] 1.2 为 `mcp-registry.test.ts` 中真实 fixture server / tool call / reconnect / concurrency 用例增加局部 Vitest timeout constant。
- [x] 1.3 为 MCP test config 增加显式 startup / request timeout budgets，并保持生产默认不变。

## 2. 验证与归档

- [x] 2.1 执行 MCP 定向测试并修复失败。
- [x] 2.2 执行 `pnpm --dir apps/agent-cli test`。
- [x] 2.3 执行 `pnpm build`。
- [x] 2.4 执行 `openspec status --change "prd-96-mcp-test-timeout-hardening" --json` 与 `openspec validate "prd-96-mcp-test-timeout-hardening" --type change`。
- [x] 2.5 全部通过后归档 OpenSpec change 并本地提交。
