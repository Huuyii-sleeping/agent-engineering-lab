## Context

当前工具执行链已经拆出几层：

- `tools/service.ts` 是 query runtime 看到的工具 facade。
- `tools/catalog.ts` 负责 registration/schema/metadata。
- `tools/executor.ts` 负责 preview 与 run。
- `runtime/tool-runtime.ts` 负责 parse、target 识别、replay dry-run、security gate 与 handler exception 包装。

问题在于 `tools/executor.ts` 仍同时包含 builtin/subagent 解析与 MCP 执行分支。随着后续 MCP 策略、builtin handler metadata、权限策略继续增长，这个文件会再次变成执行细节聚合点。

## Goals

- 将 builtin/subagent 执行与 MCP 执行拆成独立内部边界。
- 让 `ToolExecutor` 只负责 target dispatch。
- 不改变任何工具行为。

## Non-Goals

- 不改变 `ToolExecutorLike` 对外方法。
- 不改变 `resolveToolExecution` 与 `executeProtectedToolHandler`。
- 不拆 `tools/mcp.ts` 的 MCP client/registry。
- 不调整 `tools/registry.ts` 的 registration 或 handler resolver。

## Decisions

### Decision 1: 新增 `BuiltinToolExecutor`

采纳：

- `BuiltinToolExecutor` 负责 `previewToolCall` 与 builtin/subagent run。
- 继续复用 `previewBuiltinToolCall`、`resolveBuiltinToolHandler` 和 `executeProtectedToolHandler`。
- unknown builtin 工具继续返回 `BASE_UNKNOWN_TOOL`。

备选方案：

- 继续把 builtin execution 留在 `ToolExecutor`。

不采用原因：

- builtin/subagent handler resolver 与 MCP runner 的变化方向不同，继续混合会抵消 PRD-24 拆分的收益。

### Decision 2: 新增 `McpToolExecutor`

采纳：

- `McpToolExecutor` 负责 MCP protected execution。
- 继续复用 `runMcpToolByName` 与 `executeProtectedToolHandler`。
- MCP alias 未匹配时继续 fallback 到 `BASE_UNKNOWN_TOOL`。

备选方案：

- 把 MCP execution 放进 `tools/mcp.ts`。

不采用原因：

- `tools/mcp.ts` 当前主要是 MCP client/registry/transport；protected execution 属于 tools executor 层，不应塞回 transport 模块。

### Decision 3: `ToolExecutor` 只做 target dispatch

采纳：

- `ToolExecutor` 调用 `resolveToolExecution` 得到 target。
- target 为 `mcp` 时交给 `McpToolExecutor`。
- 其他 target 交给 `BuiltinToolExecutor`。

备选方案：

- 删除 `ToolExecutor`，让 `ToolService` 直接依赖 builtin/MCP executor。

不采用原因：

- `ToolService` 应继续保持一个 executor 依赖，避免把更细的 target dispatch 细节暴露给 service facade。

## Risks

- 拆分时可能改变 unknown tool fallback。
- 可能遗漏 replay safe metadata 传递。
- 测试需要覆盖 builtin 与 MCP 两条 protected execution 分支。

## Verification

- `pnpm --dir apps/agent-cli exec vitest run --no-cache test/unit/tools/builtin-executor.test.ts test/unit/tools/mcp-executor.test.ts test/unit/tools/executor.test.ts test/unit/tools/service.test.ts test/unit/tools/index.test.ts test/unit/runtime/tool-runtime.test.ts test/unit/runtime/query-tools.test.ts`
- `pnpm --filter agent-cli build`
- `openspec validate --all --strict`
