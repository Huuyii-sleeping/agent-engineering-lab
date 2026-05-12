# PRD-27 MCP 客户端与 Registry 边界拆分

## 目标

在 PRD-26 已经拆出 MCP config 与 protocol/output 后，继续把 `tools/mcp.ts` 中剩余的 MCP server client 生命周期与 registry/cache/runner 逻辑拆成独立模块。由于 client 与 registry 强相关，本轮合并执行，避免连续两轮只做机械搬移。

本阶段不改变 MCP 配置格式、工具 schema、工具输出、错误码、retry、security、observability 或 public API。

## 范围（In Scope）

- 新增 MCP client 边界，负责外部 MCP server 进程生命周期、initialize、JSON-RPC request、tools/list 与 tools/call。
- 新增 MCP registry 边界，负责 server client 管理、registration cache、alias 分配、retry 与 run。
- 更新 `tools/mcp.ts` 为 public API facade 与 active registry cache。
- 更新或新增 focused tests。
- 新增本轮中文学习沉淀文档。

## 非目标（Out of Scope）

- 不改变 `.codex/mcp.json` 配置 schema。
- 不改变 MCP output normalization 与 error JSON shape。
- 不改变 security approval 与 protected execution。
- 不改变 observability event kind 或 payload 字段。
- 不改动 MCP fixture server 行为。

## 功能要求

- `McpServerClient` 必须从 `tools/mcp.ts` 移入独立模块。
- `McpRegistry` 必须从 `tools/mcp.ts` 移入独立模块。
- `tools/mcp.ts` 必须继续暴露 `listMcpTools`、`listMcpToolRegistrations`、`runMcpToolByName`、`resetMcpRegistryForTest`。
- 现有 MCP integration test 必须继续通过。

## 验收标准（AC）

- AC-27-1：新增 `mcp-client.ts` 或等效模块承接 MCP server lifecycle。
- AC-27-2：新增 `mcp-registry.ts` 或等效模块承接 MCP registry/cache/run。
- AC-27-3：`tools/mcp.ts` 只保留 active registry 装配与 public API。
- AC-27-4：focused unit tests、build 和 OpenSpec strict 校验通过。
- AC-27-5：新增中文学习沉淀文档。

## 实施顺序

1. 建立 PRD 与 OpenSpec change。
2. 拆出 MCP client 和 registry。
3. 更新 `tools/mcp.ts` 与 focused tests。
4. 运行验证，补学习沉淀并归档 change。
