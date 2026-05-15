## Why

`PRD-61` 已经让前台入口可以探测 daemon 是否存在，但 `agent-cli tui` 仍然默认在当前进程内重新启动一套嵌入式 runtime。这样即使后台 daemon 已经在运行，TUI 也无法复用共享 session、工具状态和长期宿主能力。

如果不把 attach / reuse 这一步补上，daemon 仍然只是“能启动的后台进程”，而不是“前台可复用的本地控制面”。现在继续推进这一层，可以让本地平台化路径真正闭环。

## What Changes

- 新增 `PRD-62`，聚焦 daemon-backed TUI reuse。
- 为现有 service API 增加可供前台 attach 的轻量 client 边界，并补齐 TUI 需要的最小远端调用面。
- 让 `agent-cli tui` 在发现本地 daemon 可用时优先 attach 到共享宿主；不可用时安全回退到 embedded host。
- 同步补 focused tests、README 和 OpenSpec delta spec。

## In Scope

- daemon-backed TUI attach / reuse
- 共享 service API client
- TUI 需要的远端 session hydrate、chat 和 tool call 面
- attach 失败时的 embedded fallback
- focused tests、文档和规格同步

## Out of Scope

- 交互式 CLI attach / reuse
- daemon stop / restart / upgrade
- WebSocket、远程鉴权或跨机器控制面
- 修改现有 daemon 单实例锁与 session persistence 的基础语义

## Capabilities

### Modified Capabilities

- `agent-host-daemon-runtime`: 增补前台 TUI 对已存在 daemon 的 attach / reuse 与 fallback 语义。
- `production-runtime-architecture`: 增补 daemon-backed service client 作为前台入口复用共享宿主的稳定边界。

## Impact

- 影响代码：
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - `apps/agent-cli/src/entrypoints/daemon-lock.ts`
  - `apps/agent-cli/src/service-api/index.ts`
  - `apps/agent-cli/src/service-api/server.ts`
  - `apps/agent-cli/src/service-api/client.ts`
- 影响测试：
  - `apps/agent-cli/test/unit/entrypoints/tui.test.ts`
  - `apps/agent-cli/test/unit/agent-service.test.ts`
  - `apps/agent-cli/test/unit/service-api/client.test.ts`
- 影响文档：
  - `apps/agent-cli/README.md`
  - `openspec/changes/prd-62-daemon-tui-reuse/*`
  - `prd/incremental/PRD-62-daemon-TUI复用.md`
