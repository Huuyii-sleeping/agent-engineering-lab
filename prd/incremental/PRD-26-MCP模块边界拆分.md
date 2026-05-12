# PRD-26 MCP 模块边界拆分

## 目标

在 PRD-25 已经把 MCP protected execution 从 `ToolExecutor` 拆到 `McpToolExecutor` 后，继续收口 MCP 子系统内部边界。当前 `tools/mcp.ts` 同时承担配置读取、协议解析、输出归一化、client 生命周期、registry/cache 与 public API，文件职责过宽。

本阶段只拆出配置加载与协议/输出工具函数，不改变 MCP server 生命周期、retry、security、observability、工具 schema 或输出语义。

## 范围（In Scope）

- 新增 MCP config 边界，负责 `.codex/mcp.json` 加载与 server config 归一化。
- 新增 MCP protocol/output 边界，负责 alias 生成、工具列表解析、调用结果解析、输出归一化与结构化失败输出。
- 更新 `tools/mcp.ts` 以复用上述边界。
- 更新或新增 focused tests。
- 新增本轮中文学习沉淀文档。

## 非目标（Out of Scope）

- 不拆 `McpServerClient` 的 JSON-RPC 生命周期实现。
- 不拆 `McpRegistry` 的 cache 与 retry 流程。
- 不改变 MCP 配置格式。
- 不改变 MCP 工具输出、错误码、审批或观测事件。
- 不迁移 MCP 能力到 `services/`。

## 功能要求

- MCP 配置读取与归一化必须由独立模块承载。
- MCP 协议解析与输出归一化必须由独立模块承载。
- `tools/mcp.ts` 保持 public API 不变：`listMcpTools`、`listMcpToolRegistrations`、`runMcpToolByName`、`resetMcpRegistryForTest`。
- 现有 MCP integration test 必须继续通过。

## 验收标准（AC）

- AC-26-1：新增 `mcp-config.ts` 或等效模块承接配置加载。
- AC-26-2：新增 `mcp-protocol.ts` 或等效模块承接协议/输出工具函数。
- AC-26-3：`tools/mcp.ts` 移除配置解析与输出归一化细节，但保留 client/registry 行为。
- AC-26-4：focused unit tests、build 和 OpenSpec strict 校验通过。
- AC-26-5：新增中文学习沉淀文档。

## 实施顺序

1. 建立 PRD 与 OpenSpec change。
2. 拆出 MCP config 和 protocol/output 模块。
3. 更新 `tools/mcp.ts` 与 focused tests。
4. 运行验证，补学习沉淀并归档 change。
