## Why

PRD-26 已经拆出 MCP config 与 protocol/output，但 `tools/mcp.ts` 仍同时承载 MCP server client 生命周期、registry/cache、retry runner 与 public API。client 与 registry 是强相关的剩余边界，这轮合并拆完能让 `tools/mcp.ts` 退成更清楚的 facade。

本轮只调整模块归属，不改变 MCP 行为。

## What Changes

- 新增 MCP client 模块，承载 server process lifecycle、initialize、JSON-RPC request、tools/list 与 tools/call。
- 新增 MCP registry 模块，承载 client 管理、registration cache、alias 分配、retry 与 run。
- 更新 `tools/mcp.ts` 只做 active registry 装配与 public API。
- 保持 MCP 配置、输出、错误码、retry、security、observability 与 public API 兼容。
- 新增学习沉淀文档。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加 MCP runtime 内部必须区分 client lifecycle、registry/cache 与 public API facade 的要求。
- `architecture-learning-knowledge-base`: 继续要求本轮边界校正沉淀中文学习文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/tools/mcp-client.ts`
  - `apps/agent-cli/src/tools/mcp-registry.ts`
  - `apps/agent-cli/src/tools/mcp.ts`
  - focused MCP tests
- 影响文档：
  - 新增 `PRD-27`
  - 新增 OpenSpec change
  - 新增学习沉淀文档
- 不改变用户可见 CLI、HTTP API、工具 schema、MCP 输出、审批或观测行为。
