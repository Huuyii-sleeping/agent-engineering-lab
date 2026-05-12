## Context

当前 MCP 子系统经过几轮拆分后已经有：

- `mcp-config.ts`：配置加载与 server config 归一化。
- `mcp-protocol.ts`：协议类型、alias、frame、parse 与 output normalization。
- `mcp-executor.ts`：protected execution。

剩余问题集中在 `tools/mcp.ts`：它仍包含 `McpServerClient`、`McpRegistry`、active registry cache 与 public API。client 与 registry 强相关，但职责仍不同：client 管外部进程和 JSON-RPC 生命周期，registry 管工具注册缓存、alias 和 retry runner。

## Goals / Non-Goals

**Goals:**

- 拆出 `McpServerClient`。
- 拆出 `McpRegistry`。
- 让 `tools/mcp.ts` 只保留 active registry cache 和 public API facade。
- 保持行为兼容。

**Non-Goals:**

- 不改变 MCP config schema。
- 不改变 MCP protocol/output normalization。
- 不改变 retry 次数、timeout、observability event。
- 不改变 security gate 或 tool executor。

## Decisions

### Decision 1: 新增 `mcp-client.ts`

采纳：

- `McpServerClient` 与 `PendingRequest` 移入 `mcp-client.ts`。
- client 继续依赖 `mcp-config.ts` 的 `McpServerConfig`、`mcp-protocol.ts` 的 frame/parse 类型与函数。
- client 内部继续记录 lifecycle observability event。

备选方案：

- 继续让 client 留在 `tools/mcp.ts`。

不采用原因：

- client 生命周期包含进程、stdout frame、pending request、timeout、close 等状态逻辑，和 registry/cache 的变化方向不同。

### Decision 2: 新增 `mcp-registry.ts`

采纳：

- `McpRegistry` 移入 `mcp-registry.ts`。
- registry 负责 client map、registration cache、alias 分配、MCP run retry 与 call event。
- `tools/mcp.ts` 通过 `createMcpRegistry` 或 `new McpRegistry` 装配。

备选方案：

- 本轮只拆 client，registry 下轮再拆。

不采用原因：

- 用户希望强相关步骤可以一次执行；client 独立后 registry 的拆分主要是导入边界调整，可在同一轮完成并用 integration tests 覆盖。

### Decision 3: `tools/mcp.ts` 保持 public API facade

采纳：

- `tools/mcp.ts` 保留 `ACTIVE_REGISTRY` 与 `getRegistry`。
- public API 不变。

备选方案：

- 把 active registry cache 也放进 `mcp-registry.ts`。

不采用原因：

- active cache 是 public API facade 的装配状态，保留在 `tools/mcp.ts` 能让 registry 模块保持实例级职责，测试也更容易替换。

## Risks / Trade-offs

- [Risk] 迁移 client 时改变 close 或 timeout 行为 → Mitigation：保留原逻辑，跑现有 MCP integration test。
- [Risk] 迁移 registry 时改变 retry 或 observability payload → Mitigation：保留字段名和分支，focused tests 覆盖失败事件。
- [Risk] public API 导出变化影响 catalog/executor → Mitigation：`tools/mcp.ts` 方法签名保持不变。
