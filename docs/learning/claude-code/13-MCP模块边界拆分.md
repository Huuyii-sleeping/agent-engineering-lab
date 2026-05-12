# MCP 模块边界拆分

## 这次真正学到的东西

### 1. 大文件不一定要一次拆完，先拆稳定纯函数边界

`tools/mcp.ts` 已经同时承担配置加载、协议解析、输出归一化、client 生命周期、registry/cache 和 public API。它的问题不是某一段逻辑错误，而是变化方向过多。

这轮没有直接拆 `McpServerClient` 和 `McpRegistry`。更稳的顺序是先拆出稳定、容易测试、没有状态副作用的部分：

- MCP config
- MCP protocol/output

这样可以先降低主文件职责密度，同时不碰进程生命周期、pending request、retry 和 cache。

### 2. 协议归一化属于 MCP 子系统，不属于 tool executor

PRD-25 拆出了 `McpToolExecutor`，但 MCP call result 的结构解析、文本拼接、structured content 输出、MCP 错误格式化，并不属于 protected execution。

这些逻辑仍然是 MCP 协议适配的一部分，所以本轮放进 `mcp-protocol.ts`，而不是塞进 `mcp-executor.ts`。

## 放到本仓库里怎么看

### 当前已经有的基础

- `McpToolExecutor` 已经负责 MCP protected execution。
- `tools/mcp.ts` 已经提供稳定 public API：`listMcpTools`、`listMcpToolRegistrations`、`runMcpToolByName`、`resetMcpRegistryForTest`。
- MCP integration test 已经覆盖配置加载、工具注册、审批阻断、成功调用、失败输出和观测事件。

### 当前最明显的差距

- 配置读取和 client 生命周期混在同一个文件。
- tools/list 与 tools/call 的协议解析和 registry/cache 混在一起。
- 输出归一化逻辑没有独立测试入口。

### 这轮只解决哪些差距

- 这轮要做的：拆出 `mcp-config.ts` 与 `mcp-protocol.ts`。
- 这轮不做的：不拆 `McpServerClient`，不拆 `McpRegistry`，不改变 MCP 配置 schema、retry、timeout、错误码、审批或观测事件。

## 这轮采纳了什么

### 采纳

- 新增 `apps/agent-cli/src/tools/mcp-config.ts`

`mcp-config.ts` 负责：

- 读取 `.codex/mcp.json`
- 处理缺失或非法 JSON
- 归一化 server name、command、args、env、cwd、timeout
- 过滤 disabled server

- 新增 `apps/agent-cli/src/tools/mcp-protocol.ts`

`mcp-protocol.ts` 负责：

- JSON-RPC response 与 MCP tool/call result 类型
- MCP alias 生成
- tools/list 结果解析
- tools/call 结果解析
- MCP 成功与失败输出归一化
- MCP JSON-RPC frame 写入

- 更新 `apps/agent-cli/src/tools/mcp.ts`

`tools/mcp.ts` 继续保留：

- `McpServerClient`
- `McpRegistry`
- registry cache 与 retry
- public API

### 暂不采纳

- 暂不拆 `McpServerClient`

它涉及进程启动、初始化、stdout frame parse、pending request、timeout、异常退出和 close 语义。一次性拆动风险高，应该单独做。

- 暂不拆 `McpRegistry`

它涉及 alias cache、server client 管理、retry、observability 和 run path。等 client 边界更清楚后再拆更稳。

- 暂不改变 `mcp-executor.ts`

`McpToolExecutor` 只关心 protected execution；MCP 协议细节留在 MCP 子系统内部。

## 这轮实际改成了什么

- `mcp-config.ts` 承接配置加载。
- `mcp-protocol.ts` 承接协议解析与输出归一化。
- `mcp.ts` 变成 config/protocol 边界的调用方，并继续保留 client/registry。
- focused tests 覆盖 config 归一化、protocol 输出形状和原有 MCP integration path。

改完之后，后续变更入口更清楚：

- 调整 `.codex/mcp.json` 读取和默认值，优先改 `mcp-config.ts`。
- 调整 MCP 输出形状或 tools/list parse，优先改 `mcp-protocol.ts`。
- 调整 server 生命周期、cache 或 retry，才改 `tools/mcp.ts`。

## 下一步最自然的动作

1. 单独拆 `McpServerClient`，把 JSON-RPC lifecycle 从 registry 文件中独立出来。
2. 再评估 `McpRegistry` 是否拆成 registry 与 runner。
3. 观察 MCP config 是否需要支持更明确的 schema validation 与错误报告。
