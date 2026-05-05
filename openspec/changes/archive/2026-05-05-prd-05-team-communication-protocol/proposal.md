## Why

当前代理已具备子代理、上下文压缩和后台任务能力，但仍缺少“团队级通信和流程协议”，无法在多代理场景中稳定协作与治理。PRD-05 需要补齐消息总线、队友状态管理、计划审批和关停协议信道。

## What Changes

- 新增团队消息总线与队友管理器：基于 `.team/inbox/*.jsonl` 持久化通信。
- 新增团队工具：点对点消息、广播、协议请求与协议响应。
- 新增协议跟踪：`shutdown_request/shutdown_response/plan_approval/plan_approval_response`，并统一请求状态。
- 新增团队观测工具：查看队友状态与 inbox 消息。

## In Scope

- `MessageBus/TeammateManager`。
- 请求响应通过 `request_id` 关联。
- 请求状态统一为 `pending/approved/rejected`。

## Out of Scope

- 自动认领任务与 worktree 隔离。
- 外部网络团队节点发现。

## Capabilities

### New Capabilities
- `team-communication-protocol`: 团队消息、队友状态、协议请求/响应闭环。

### Modified Capabilities
- `core-agent-loop`: 增加团队消息通知注入能力。

## Impact

- 影响代码：新增 `team` 工具模块、主循环通知注入。
- 影响接口：新增团队通信与协议工具集合。
- 系统影响：新增 `.team/inbox` 与 `.team/requests.json` 持久化数据。
