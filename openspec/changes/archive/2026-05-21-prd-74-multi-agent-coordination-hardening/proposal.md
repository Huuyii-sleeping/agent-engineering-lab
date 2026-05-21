## Why

当前仓库已经具备 subagent、team 和 task board 的基础原语，但它们还不足以支撑文章里描述的 multi-agent 协作闭环。问题不在于“有没有代理”，而在于协作关系是否可见、消息是否可确认、任务是否有明确 owner。

## What Changes

In Scope:

- 为 `subagent_spawn` 增加角色与父代理元数据，`subagent_list`/通知输出同步暴露这些信息。
- 为 team inbox 增加 unread/ack 语义，新增明确的 inbox mark-read 行为。
- 为 task board 增加显式 `task_claim`，并在 task 列表中暴露 owner。
- 更新相关测试与 smoke，验证多 agent 协作闭环。

Out of Scope:

- 不实现外部 swarm 进程编排。
- 不新增独立协调器服务。
- 不改变现有消息持久化目录结构。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `subagent-collaboration`: 子代理需要暴露角色与父子关系元数据，支持更清晰的协作层次。
- `team-communication-protocol`: team inbox 需要 unread/ack 语义，而不是只支持全量读取。
- `task-visualization-persistence`: task board 需要显式 claim 和 owner 可见性，支持任务分配与追踪。

## Impact

- 影响 `apps/agent-cli/src/tools/subagent*.ts`、`team*.ts`、`task*.ts` 与 `runtime/query-notifications.ts`。
- 影响对应的 unit/smoke tests。
- 影响 OpenSpec 主规格 `subagent-collaboration`、`team-communication-protocol`、`task-visualization-persistence`。

