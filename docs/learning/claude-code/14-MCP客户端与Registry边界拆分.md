# MCP 客户端与 Registry 边界拆分

## 这次真正学到的东西

### 1. 强相关的连续拆分可以合并执行

PRD-26 拆出了 MCP config 与 protocol/output 后，`tools/mcp.ts` 剩下的两个大块是：

- `McpServerClient`
- `McpRegistry`

这两个边界强相关：registry 负责管理 client、registration cache、alias 和 retry；client 负责外部进程生命周期与 JSON-RPC request。只拆 client 会让 `mcp.ts` 仍然保留 registry 大块代码；只拆 registry 又没有意义。因此这轮把 client 与 registry 一起拆完。

### 2. facade 应该留下装配状态，而不是执行细节

`tools/mcp.ts` 的 public API 已经稳定：

- `listMcpTools`
- `listMcpToolRegistrations`
- `runMcpToolByName`
- `resetMcpRegistryForTest`

这轮保留了 active registry cache 与 public API facade，把执行细节放到 `mcp-client.ts` 和 `mcp-registry.ts`。这样调用方不需要感知内部拆分，后续维护者也能更快定位问题。

## 放到本仓库里怎么看

### 当前已经有的基础

- `mcp-config.ts` 已经负责配置加载。
- `mcp-protocol.ts` 已经负责 alias、frame、parse 与 output normalization。
- `mcp-executor.ts` 已经负责 protected execution。
- MCP integration test 已经覆盖工具注册、审批、成功调用、失败输出和观测事件。

### 当前最明显的差距

- `McpServerClient` 的进程生命周期仍在 `tools/mcp.ts`。
- `McpRegistry` 的 cache/retry/run 仍在 `tools/mcp.ts`。
- `tools/mcp.ts` 仍不是纯 public API facade。

### 这轮只解决哪些差距

- 这轮要做的：拆出 `mcp-client.ts` 与 `mcp-registry.ts`。
- 这轮不做的：不改 MCP 配置、protocol/output、retry 语义、错误码、审批、安全门禁或观测事件。

## 这轮采纳了什么

### 采纳

- 新增 `apps/agent-cli/src/tools/mcp-client.ts`

`McpServerClient` 负责：

- 外部 MCP server 进程启动
- initialize request
- stdout frame parse
- pending request 与 timeout
- `tools/list`
- `tools/call`
- close 与 lifecycle event

- 新增 `apps/agent-cli/src/tools/mcp-registry.ts`

`McpRegistry` 负责：

- server client map
- registration cache
- MCP alias 分配
- OpenAI tool schema projection
- MCP tool run、retry 与 call event

- 更新 `apps/agent-cli/src/tools/mcp.ts`

`tools/mcp.ts` 现在负责：

- active registry cache
- registry key 计算
- public API facade

### 暂不采纳

- 暂不把 active registry cache 放进 `mcp-registry.ts`

active cache 是 public API facade 的装配状态，不是单个 registry 实例的职责。保留在 `tools/mcp.ts` 能让 `McpRegistry` 更容易单测。

- 暂不改 retry 和 observability

本轮是边界拆分，不是行为调整。retry 次数、错误码和 event payload 都保持原样。

- 暂不继续拆 registry runner

`McpRegistry` 现在刚独立出来，先观察它后续是否继续增长；如果增长，再拆 registry 与 runner。

## 这轮实际改成了什么

- `mcp-client.ts` 承接 JSON-RPC lifecycle。
- `mcp-registry.ts` 承接 registry/cache/run。
- `mcp.ts` 收成 public API facade。
- focused tests 覆盖 client、registry、config、protocol、executor 和原有 integration path。

改完之后，后续变更入口更清楚：

- 调整进程生命周期、initialize、request timeout，优先改 `mcp-client.ts`。
- 调整 alias、registration cache、retry、call event，优先改 `mcp-registry.ts`。
- 调整 public API 装配和 active registry reset，才改 `mcp.ts`。

## 下一步最自然的动作

1. 观察 `McpRegistry` 是否需要进一步拆成 registry 与 runner。
2. 评估 MCP config 是否需要显式 schema validation 和用户可读错误报告。
3. 回到工具层以外，检查 `team.ts`、`security.ts` 等大工具模块是否需要类似的内部边界收口。
