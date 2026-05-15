## Why

`PRD-62` 已经让 `agent-cli tui` 可以复用本地 daemon，但 `agent-cli mcp-server` 仍然默认在当前进程内创建 embedded `AgentService`。这意味着 daemon-backed 多入口共享宿主仍然只打通了一半，MCP 入口还没有真正复用同一宿主。

如果这一步不补，MCP 仍然是另一套局部 runtime，session 和宿主状态无法和 daemon 合流，也不利于把 attach/reuse 做成统一入口策略。

## What Changes

- 新增 `PRD-64`，聚焦 daemon-backed MCP reuse。
- 抽取共享 daemon service client resolver，避免 TUI 和 MCP 各自复制一套 daemon 探测与连接逻辑。
- 让 `agent-cli mcp-server` 在 daemon 可用时优先 attach，到共享宿主不可用时回退 embedded host。
- 补 MCP 入口所需的最小 client surface，并同步 focused tests、README 和 OpenSpec delta spec。

## In Scope

- daemon-backed MCP attach / reuse
- 共享 daemon client resolver
- MCP 入口需要的远端 session detail / createSession 面
- attach 失败时的 embedded fallback
- focused tests、文档和规格同步

## Out of Scope

- 交互式 CLI attach
- 新增新的 MCP 协议能力
- daemon stop / restart / upgrade
- 修改现有 session persistence 与 host event 语义

## Capabilities

### Modified Capabilities

- `agent-host-daemon-runtime`: 增补 MCP 入口对已存在 daemon 的 attach / reuse 与 fallback 语义。
- `production-runtime-architecture`: 增补共享 daemon service client resolver 作为多入口复用宿主的稳定边界。

## Impact

- 影响代码：
  - `apps/agent-cli/src/entrypoints/mcp-server.ts`
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - `apps/agent-cli/src/service-api/client.ts`
  - `apps/agent-cli/src/service-api/daemon-client.ts`
- 影响测试：
  - `apps/agent-cli/test/unit/entrypoints/mcp-server.test.ts`
  - `apps/agent-cli/test/unit/service-api/client.test.ts`
- 影响文档：
  - `apps/agent-cli/README.md`
  - `openspec/changes/prd-64-daemon-mcp-reuse/*`
  - `prd/incremental/PRD-64-daemon-MCP复用.md`
