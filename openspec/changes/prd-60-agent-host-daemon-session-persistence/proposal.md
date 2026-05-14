## Why

当前 `agent-cli` 已经具备较完整的本地 Agent 能力，但运行时仍主要以“当前进程内临时装配并执行”为主，缺少长期宿主、后台驻留和会话恢复能力。这会限制 CLI、TUI、HTTP 和 MCP 入口共享同一套运行时，也让它在稳定性和平台化程度上难以超过 Claude Code 这类竞品。

现在需要先补齐本地 Agent 平台的底座：把运行时从“可运行”推进到“可长期承载、可恢复、可多入口共享”，为后续的工具调度、插件运行时和远程控制面打基础。

## What Changes

- 新增 `AgentHost` 抽象，承载 runtime services、query engine、session registry、event bus 和生命周期管理。
- 新增 `daemon` 入口，使 `agent-cli` 可以作为长期驻留后台进程运行，而不是每个入口各自启动一套 runtime。
- 为 service API 引入 session 持久化存储，使 session 在进程重启后仍可恢复。
- 调整 CLI / TUI / HTTP / MCP 的装配路径，优先通过共享 host 复用同一套运行时能力。
- 为 `agent-cli` 明确“本地平台底座优先”的演进方向：先解决长期宿主、恢复和共享运行时，再继续工具并发编排与插件体系。

## Capabilities

### New Capabilities

- `agent-host-daemon-runtime`: 定义长期宿主、后台运行和共享运行时装配边界。

### Modified Capabilities

- `agent-service-sessions`: 扩展 session 能力，从仅内存隔离提升到可持久化恢复。
- `production-runtime-architecture`: 增补长期宿主、daemon 入口和多入口共享 host 的运行时分层要求。

## Impact

- 受影响代码：
  - `apps/agent-cli/src/bootstrap/*`
  - `apps/agent-cli/src/service-api/*`
  - `apps/agent-cli/src/entrypoints/*`
  - `apps/agent-cli/src/runtime/*`
- 预计新增代码：
  - `apps/agent-cli/src/host/*`
  - `apps/agent-cli/src/service-api/session-store.ts`
  - `apps/agent-cli/src/entrypoints/daemon.ts`
- 受影响接口：
  - CLI 调度入口
  - HTTP service / bridge 会话行为
  - MCP server 装配路径
- 受影响系统：
  - session 生命周期
  - 本地事件流
  - 运行时恢复能力
