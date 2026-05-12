## Why

`apps/agent-cli/src/tools/mcp.ts` 已经膨胀到同时承担配置加载、MCP JSON-RPC client、registry/cache、工具输出归一化和对外 API。继续把这些职责放在同一个文件里，会让后续调整配置格式、输出规范或 registry 行为时反复触碰一大坨实现细节。

这一轮只收 `tools/mcp.ts` 的内部模块边界，把配置与协议/输出工具函数拆出来，不改变 MCP 行为。

## What Changes

- 新增 MCP 配置加载边界，承接 `.codex/mcp.json` 读取与 server config 归一化。
- 新增 MCP 协议/输出边界，承接 alias 生成、工具列表解析、调用结果解析与输出归一化。
- 更新 `tools/mcp.ts` 以组合上述内部边界。
- 保持 MCP client、registry、security、observability 与 public API 行为兼容。
- 新增学习沉淀文档。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加工具 MCP 模块内部必须区分 config/protocol/registry boundary 的要求。
- `architecture-learning-knowledge-base`: 继续要求本轮边界校正沉淀中文学习文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/tools/mcp-config.ts`
  - `apps/agent-cli/src/tools/mcp-protocol.ts`
  - `apps/agent-cli/src/tools/mcp.ts`
  - focused MCP tests
- 影响文档：
  - 新增 `PRD-26`
  - 新增 OpenSpec change
  - 新增学习沉淀文档
- 不改变用户可见 CLI、HTTP API、工具 schema、MCP 输出、审批或观测行为。
