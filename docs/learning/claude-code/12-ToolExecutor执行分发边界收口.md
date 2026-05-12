# ToolExecutor 执行分发边界收口

## 这次真正学到的东西

### 1. executor facade 还需要继续区分“分发”和“执行”

PRD-24 把 `ToolService` 拆成 catalog 与 executor 后，`ToolExecutor` 成了工具执行入口。

但 `ToolExecutor` 内部仍同时做两类事情：

- 判断工具 target，并决定走 builtin/subagent 还是 MCP
- 直接处理 builtin handler resolver、MCP runner、protected execution 包装

这会让 executor 很快重新变成执行细节聚合点。更清楚的边界是：`ToolExecutor` 只做 target dispatch，具体 target 的执行由专门 executor 承接。

### 2. transport 和 protected execution 不应该混在一起

MCP client/registry 在 `tools/mcp.ts` 里已经负责配置加载、进程通信、工具列表和远端调用。

这轮没有把 protected execution 塞进 `tools/mcp.ts`，而是新增 MCP executor。原因是 replay dry-run、security gate、unknown fallback 属于工具执行层语义，不属于 MCP transport 本身。

## 放到本仓库里怎么看

### 当前已经有的基础

- `ToolService` 已经是 catalog + executor facade。
- `ToolCatalog` 已经负责 registration/schema/metadata。
- `ToolExecutor` 已经是工具执行入口。
- `runtime/tool-runtime.ts` 已经提供 target 识别和 protected execution。

### 当前最明显的差距

- `ToolExecutor` 仍直接引用 builtin registry resolver。
- `ToolExecutor` 仍直接引用 MCP runner。
- builtin/subagent 与 MCP 执行策略在同一个文件里变化。

### 这轮只解决哪些差距

- 这轮要做的：拆出 builtin executor 与 MCP executor，让 `ToolExecutor` 只做 dispatch。
- 这轮不做的：不改工具行为，不改 replay/security gate，不拆 MCP client/registry，不迁移工具层文件。

## 这轮采纳了什么

### 采纳

- 新增 `apps/agent-cli/src/tools/builtin-executor.ts`

`BuiltinToolExecutor` 负责：

- builtin/subagent preview
- builtin/subagent handler resolver
- replay safe metadata 传递
- unknown builtin fallback

- 新增 `apps/agent-cli/src/tools/mcp-executor.ts`

`McpToolExecutor` 负责：

- MCP runner 调用
- MCP protected execution 包装
- MCP alias 未命中时的 unknown fallback

- 更新 `apps/agent-cli/src/tools/executor.ts`

`ToolExecutor` 现在负责：

- 调用 `resolveToolExecution`
- 根据 target 分发到 builtin executor 或 MCP executor
- 保持 `ToolExecutorLike` 不变

### 暂不采纳

- 暂不拆 `runtime/tool-runtime.ts`

它当前仍是通用执行保护层，负责 parse、target 识别、replay dry-run、security gate 和 exception 包装。现在还没有足够重复逻辑需要继续拆。

- 暂不拆 `tools/mcp.ts`

MCP client/registry 的复杂度来自 transport 与 JSON-RPC 生命周期，不属于本轮 executor dispatch 收口范围。

- 暂不让 `ToolService` 感知多个 executor

`ToolService` 继续只依赖一个 `ToolExecutorLike`，避免把 target dispatch 细节上泄到 service facade。

## 这轮实际改成了什么

- `builtin-executor.ts` 承接 builtin/subagent preview 与执行。
- `mcp-executor.ts` 承接 MCP protected execution。
- `executor.ts` 退成 target dispatch facade。
- focused tests 分别覆盖 dispatch、builtin execution、MCP execution。

改完之后，后续变更入口更清楚：

- 调整 builtin/subagent handler、preview 或 replay metadata，优先改 `BuiltinToolExecutor`。
- 调整 MCP 工具执行包装或 fallback，优先改 `McpToolExecutor`。
- 调整 target 判断和分发，才改 `ToolExecutor`。

## 下一步最自然的动作

1. 观察 security/replay 规则是否需要从 `runtime/tool-runtime.ts` 抽成 policy 边界。
2. 评估 `tools/mcp.ts` 是否需要按 config、client、registry、runner 继续拆小。
3. 等工具执行边界稳定后，再推进 Web 展示或 service API 对运行时状态的复用。
