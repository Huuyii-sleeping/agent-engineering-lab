# PRD-59: agent-cli service API 文件结构对齐

## 背景

在 `cli/` 和 `delivery/` 已经收口之后，`agent-cli` 根目录里剩下最明显仍然成组平铺的一类文件，是会话管理与 HTTP service surface：

- `agent-service.ts`
- `agent-service-sessions.ts`
- `server.ts`

它们共同表达的是 `AgentService` 相关的对外 API surface，而不是 runtime `services/` 依赖包的一部分。

## 目标

- 把 service API / HTTP surface 相关实现收拢到专门的 `src/service-api/` 子目录。
- 保持 TUI、CLI dispatcher、MCP server 与 HTTP server 的现有行为不变。
- 同步沉淀文档中的目录边界说明。

## 方案

- 建立 `apps/agent-cli/src/service-api/`
- 迁移：
  - `agent-service.ts` -> `service-api/index.ts`
  - `agent-service-sessions.ts` -> `service-api/sessions.ts`
  - `server.ts` -> `service-api/server.ts`
- 更新 import：
  - `entrypoints/cli-dispatcher.ts`
  - `entrypoints/tui.ts`
  - `entrypoints/mcp-server.ts`
  - `cli/index.ts`
  - 对应 unit / smoke tests

## 验收标准

- `apps/agent-cli/src/service-api/` 成为会话管理与 HTTP service surface 的稳定目录。
- `services/` 仍然只承担 runtime 依赖服务层，不混入对外 API surface。
- focused tests、build、OpenSpec strict 和差异检查通过。
