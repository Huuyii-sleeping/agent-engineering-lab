## Why

`PRD-60` 到 `PRD-62` 已经把 `AgentHost`、daemon 和前台 attach 基础打起来了，但事件流仍然主要挂在 `AgentService` 上。这意味着即使多个入口共享同一个 host，它们看到的事件订阅和事件编号仍然是 service-instance 级别的，不是真正的宿主级事件流。

如果不把这一层收拢到 `AgentHost`，daemon-backed 多入口共享宿主的事件语义仍然是不完整的，后续要继续接 scheduler、plugin runtime 或更多 attach 入口时会继续分裂。

## What Changes

- 新增 `PRD-63`，聚焦 `AgentHost` 事件流收拢。
- 将共享事件订阅、事件编号和事件分发从 `AgentService` 下沉到 `AgentHost`。
- 让 `AgentService` 改为复用 host-owned event stream，而不是各自持有独立事件总线。
- 同步补 focused tests、README 和 OpenSpec delta spec。

## In Scope

- host-owned event stream
- `AgentService` 对共享 host 事件流的复用
- 多 service 实例共享同一 host 时的统一事件语义
- focused tests、文档和规格同步

## Out of Scope

- 新增新的事件类型或新的外部协议
- scheduler / plugin runtime 事件接入
- 修改现有 daemon attach、session persistence 或 chat 业务语义

## Capabilities

### Modified Capabilities

- `agent-host-daemon-runtime`: 增补共享宿主拥有统一事件流而不是由 `AgentService` 各自维护的要求。
- `production-runtime-architecture`: 增补前台入口复用共享 host 时，事件流也必须复用同一宿主边界的要求。

## Impact

- 影响代码：
  - `apps/agent-cli/src/host/agent-host.ts`
  - `apps/agent-cli/src/service-api/index.ts`
  - `apps/agent-cli/src/host/events.ts`
- 影响测试：
  - `apps/agent-cli/test/unit/agent-service.test.ts`
  - `apps/agent-cli/test/unit/service-api/agent-host.test.ts`
- 影响文档：
  - `apps/agent-cli/README.md`
  - `openspec/changes/prd-63-agent-host-event-stream/*`
  - `prd/incremental/PRD-63-AgentHost事件流收拢.md`
