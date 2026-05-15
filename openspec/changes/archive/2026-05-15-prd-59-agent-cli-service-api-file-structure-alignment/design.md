## Context

当前 `agent-cli` 已经把本地控制面和 delivery 验证分别收到了 `src/cli/`、`src/delivery/`。相比之下，会话管理与 HTTP service surface 仍然散落在 `src/` 根层：

- `agent-service.ts`
- `agent-service-sessions.ts`
- `server.ts`

这组三个文件共同表达的是“对外 service API surface”，并不属于 `services/` 目录里的 runtime service bundle。若直接塞进 `services/`，会把“对外 API 层”和“query runtime 依赖服务层”混在一起，边界会退化。

## Goals

- 为 session / HTTP service surface 建立独立目录边界。
- 让 TUI、CLI dispatcher、MCP server 和 smoke/unit tests 通过稳定子目录引用 `AgentService` 能力。
- 保持现有 HTTP API、session 语义和 server 启动行为不变。

## Non-Goals

- 不修改 `/health`、`/chat`、`/sessions`、`/events` 等 endpoint 行为。
- 不变更 `AgentSessionRecord` 结构。
- 不把 runtime `services/` 目录扩展成 HTTP/API 层杂项容器。

## Decisions

### Decision 1: 建立 `src/service-api/`，而不是迁移到 `src/services/`

`services/` 已经用于 `delivery-service.ts`、`memory-service.ts`、`observability-service.ts` 等 runtime service bundle。`AgentService` 则是一个对外 session / transport surface，负责承接 CLI/TUI/MCP/HTTP 的会话访问契约。

因此更清晰的做法是建立新的 `src/service-api/`：

- `src/service-api/index.ts`
- `src/service-api/sessions.ts`
- `src/service-api/server.ts`

而不是混入 `src/services/`。

### Decision 2: `server.ts` 归入同一子树，而不是单独挪到 `entrypoints/`

`server.ts` 当前主要职责是基于 `AgentService` 创建 HTTP server 并启动监听。它不是 CLI dispatcher 这种“模式分流”入口，也不是 TUI/MCP 这种完整独立交互面；它是 service API surface 的启动器。

因此把它放进 `service-api/` 比放进 `entrypoints/` 更能表达职责内聚。

### Decision 3: 直接更新调用方 import，不保留根层兼容包装

和 `cli/`、`delivery/` 一样，这次迁移直接更新 import 到新路径：

- `entrypoints/cli-dispatcher.ts`
- `entrypoints/tui.ts`
- `entrypoints/mcp-server.ts`
- `cli/index.ts`
- 相关 unit / smoke tests

不保留根层 wrapper，避免根层路径长期“名义已迁移、实际还在用”的双轨状态。

## Consequences

正面结果：

- `src/` 根层进一步接近“只保留真正应用根模块和共享基础模块”。
- 维护者可以明确区分 `services/` 与 `service-api/`。
- HTTP service / session surface 的演进点更集中。

代价：

- 需要同步更新一批 import 和文档链接。
- 相关测试中一些历史遗留的旧 service import 也要一并校正，才能把验证跑通。

## Implementation Plan

1. 新增 `PRD-59` 文档、proposal / design / delta spec，并同步主规格。
2. 建立 `src/service-api/` 并迁移 service API 相关文件。
3. 更新 CLI dispatcher、TUI、MCP server、CLI runtime 和 tests 的 import。
4. 同步 README / 学习沉淀中的目录说明。
5. 跑 focused tests、build、OpenSpec strict 和差异检查。
