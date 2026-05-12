## Why

PRD-24 已经让 `ToolService` 退成 catalog + executor facade，但 `ToolExecutor` 内部仍同时处理 target 判断、builtin/subagent handler 解析、MCP runner 调用和 protected execution。继续堆在一个类里，会让后续调整 builtin、MCP 或权限策略时再次集中修改同一文件。

这一轮只收 `ToolExecutor` 内部执行分发边界，不改变任何工具行为。

## What Changes

- 新增 builtin executor 模块，承载 builtin/subagent preview 与 protected handler execution。
- 新增 MCP executor 模块，承载 MCP protected execution 与 unknown fallback。
- 更新 `ToolExecutor` 为 target dispatch facade。
- 保持 `ToolExecutorLike`、`ToolServiceLike`、`tools/index.ts` 和工具输出兼容。
- 新增学习沉淀文档。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加工具 executor 内部必须区分 dispatch、builtin execution 与 MCP execution boundary 的要求。
- `architecture-learning-knowledge-base`: 继续要求本轮边界校正沉淀中文学习文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/tools/builtin-executor.ts`
  - `apps/agent-cli/src/tools/mcp-executor.ts`
  - `apps/agent-cli/src/tools/executor.ts`
  - focused tool tests
- 影响文档：
  - 新增 `PRD-25`
  - 新增 OpenSpec change
  - 新增学习沉淀文档
- 不改变用户可见 CLI、HTTP API、工具 schema、工具名称或工具输出。
