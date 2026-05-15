## Why

`PRD-60` 已经把 `AgentHost`、`daemon` 和 session persistence 底座搭起来了，但前台入口仍然缺少一个最基本的控制面能力：判断 daemon 是否已经存在。

没有这个探测面，后续想做 CLI/TUI attach、daemon reuse 或更明确的后台进程提示时，调用方只能盲目启动或自己猜测环境状态。这会让控制面继续停留在“能跑 daemon”，而不是“能管理 daemon”。

## What Changes

- 新增 `PRD-61`，聚焦 `daemon status` 探测能力。
- 为 daemon lock 增加只读状态探测 API，用于区分 `running`、`not_running` 和 `stale`。
- 新增 `agent-cli daemon status` CLI 子命令，输出当前 daemon 状态并提供可脚本化的退出码。
- 补 focused tests，并同步 README / 规格说明。

## In Scope

- daemon lock 状态探测
- `agent-cli daemon status`
- focused tests、build、OpenSpec strict
- 文档和规格同步

## Out of Scope

- daemon attach / reuse
- daemon stop / restart
- WebSocket 或远程控制面
- 修改 daemon 启动或 session persistence 语义

## Capabilities

### Modified Capabilities

- `agent-host-daemon-runtime`: 增补 daemon 状态探测和前台控制面可观测性的要求。

## Impact

- 影响代码：
  - `apps/agent-cli/src/entrypoints/daemon-lock.ts`
  - `apps/agent-cli/src/entrypoints/daemon.ts`
  - `apps/agent-cli/src/entrypoints/cli-dispatcher.ts`
- 影响测试：
  - `apps/agent-cli/test/unit/entrypoints/daemon-lock.test.ts`
  - `apps/agent-cli/test/unit/entrypoints/daemon.test.ts`
  - `apps/agent-cli/test/unit/entrypoints/cli-dispatcher.test.ts`
- 影响文档：
  - `apps/agent-cli/README.md`
  - `openspec/changes/prd-61-daemon-status-probe/*`
