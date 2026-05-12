## Context

当前 MCP 子系统已经接入工具总线，并经过 catalog、executor、security 与 observability 链路。但 `tools/mcp.ts` 仍是一个 600 行以上的大文件，包含：

- `.codex/mcp.json` 读取与配置归一化
- MCP JSON-RPC framing 与 response parse
- tools/list 与 tools/call payload parse
- MCP 输出归一化与结构化失败输出
- server client 生命周期管理
- registry/cache 与 retry
- public API

这轮只拆出最稳定、最容易独立测试的两个边界：config 与 protocol/output。client/registry 仍留在 `tools/mcp.ts`，避免一次性改动 JSON-RPC 生命周期和 retry 行为。

## Goals / Non-Goals

**Goals:**

- 拆出 MCP 配置加载模块。
- 拆出 MCP 协议/输出工具模块。
- 保持 MCP public API 与运行行为不变。
- 为后续继续拆 client/registry 降低风险。

**Non-Goals:**

- 不改变 MCP 配置 schema。
- 不改变 MCP retry、timeout、observability 事件。
- 不拆 `McpServerClient` 与 `McpRegistry`。
- 不调整工具审批、安全门禁或 protected execution。

## Decisions

### Decision 1: 新增 `mcp-config.ts`

采纳：

- `McpServerConfig` 类型与 `loadMcpServerConfigs` 进入独立模块。
- 该模块负责读取 `.codex/mcp.json`、归一化 env/args/cwd/timeout，并过滤 disabled server。

备选方案：

- 继续把配置读取留在 `tools/mcp.ts`。

不采用原因：

- 配置读取与 JSON-RPC client 生命周期变化方向不同；拆出去后可以单独覆盖无配置、无效配置、disabled server、timeout override 等规则。

### Decision 2: 新增 `mcp-protocol.ts`

采纳：

- JSON-RPC response、tool descriptor、call result 等协议类型进入独立模块。
- `writeFrame`、`parseToolsList`、`parseCallResult`、`makeToolAlias`、`normalizeMcpCallOutput`、`formatMcpFailure` 进入独立模块。

备选方案：

- 把输出归一化放入 `mcp-executor.ts`。

不采用原因：

- `mcp-executor.ts` 负责 protected execution，MCP call result 的协议归一化仍属于 MCP 子系统，而不是通用 tool executor。

### Decision 3: `tools/mcp.ts` 继续保留 client/registry

采纳：

- 本轮只让 `tools/mcp.ts` 复用 config 与 protocol/output 边界。
- `McpServerClient`、`McpRegistry` 和 public API 暂时留在原文件。

备选方案：

- 同时拆出 `mcp-client.ts` 与 `mcp-registry.ts`。

不采用原因：

- client 和 registry 涉及进程生命周期、pending request、cache、retry 与 observability，单轮同时拆风险更高。先拆稳定纯函数边界更适合小步迭代。

## Risks / Trade-offs

- [Risk] 移动 output normalization 时改变换行或错误 JSON 格式 → Mitigation：新增 focused tests 覆盖 structured content、text content 与 error result。
- [Risk] 配置归一化迁移后 cwd/timeout 默认值变化 → Mitigation：新增 config tests 覆盖默认值、disabled server 和 cwd resolve。
- [Risk] 类型导出扩大内部 API 面 → Mitigation：只导出 MCP 子系统内部需要复用的类型与函数，不从 `tools/index.ts` 暴露。
