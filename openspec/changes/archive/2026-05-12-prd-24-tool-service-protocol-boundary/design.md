## Context

当前工具层已经有几块基础：

- `tools/protocol.ts` 定义 registration 与 metadata 转换。
- `tools/registry.ts` 管 builtin tool registration、preview 和 handler 解析。
- `tools/service.ts` 统一暴露工具列表、metadata、preview 和执行。
- `runtime/tool-runtime.ts` 管执行保护、replay dry-run 与工具目标识别。

问题在于 `ToolService` 仍把 catalog 和 executor 聚在一起。它既负责 list，又负责 run。后续如果新增工具来源、权限策略或更细的 metadata，很容易继续扩宽 `ToolService`。

## Goals

- 将工具发现/metadata 与工具执行分发拆成两个内部边界。
- 保持 `ToolService` 对 query runtime 的 facade 角色。
- 不改变任何工具行为。

## Non-Goals

- 不移动 `ToolService` 文件位置。
- 不改变 `ToolRegistration` 协议字段。
- 不重写 `runtime/tool-runtime.ts`。
- 不调整 MCP 或 subagent 工具行为。

## Decisions

### Decision 1: 新增 `ToolCatalog`

采纳：

- `ToolCatalog` 负责 `listToolRegistrations`、`listTools`、`listToolMetadata`。
- 继续复用 `BUILTIN_TOOL_REGISTRATIONS`、`listMcpToolRegistrations`、`toChatCompletionTool`、`toToolMetadata`。

备选方案：

- 继续让 `ToolService` 直接 list。

不采用原因：

- list 和 run 的变化方向不同。Catalog 更可能承接工具来源和 metadata，executor 更可能承接权限和调度。

### Decision 2: 新增 `ToolExecutor`

采纳：

- `ToolExecutor` 负责 `previewToolCall` 与 `runToolByName`。
- 继续复用 `resolveToolExecution`、`executeProtectedToolHandler`、MCP runner 和 builtin handler resolver。

备选方案：

- 把 executor 逻辑并入 `runtime/tool-runtime.ts`。

不采用原因：

- `runtime/tool-runtime.ts` 更像通用执行保护和目标识别层；具体 builtin/MCP handler 分发属于 tools 子系统。

### Decision 3: `ToolService` 只做 facade

采纳：

- `ToolService` 默认组合 `DEFAULT_TOOL_CATALOG` 和 `DEFAULT_TOOL_EXECUTOR`。
- 允许测试传入 fake catalog/executor。

备选方案：

- 删除 `ToolService`，让调用方直接用 catalog/executor。

不采用原因：

- Query runtime 仍然需要一个稳定工具服务依赖，拆掉 facade 会把调用方暴露给两个更细边界。

## Risks

- 拆分时可能漏掉 MCP registration 合并。
- 默认实例之间若互相 import 不当，可能产生循环依赖。
- 测试需要确认旧 `tools/index.ts` 行为不变。

## Verification

- `pnpm --dir apps/agent-cli exec vitest run --no-cache test/unit/tools/registry.test.ts test/unit/tools/index.test.ts test/unit/runtime/tool-runtime.test.ts test/unit/runtime/query-engine.test.ts test/unit/runtime/query-tools.test.ts`
- `pnpm --filter agent-cli build`
- `openspec validate --all --strict`
