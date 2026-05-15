# PRD-63 AgentHost 事件流收拢

## 背景

当前 `AgentHost` 已经承载了 session 和长期宿主语义，但事件流仍然主要挂在 `AgentService` 上。这样多个入口即使共享同一个 host，也没有真正共享同一条宿主级事件流。

## 目标

- 让 `AgentHost` 持有共享事件订阅与递增事件编号。
- 让多个 `AgentService` 复用同一 host 时看到一致的事件语义。
- 保持现有 `/events` 与 `subscribeEvents()` 调用面不变。

## In Scope

- host-owned event stream
- `AgentService` 复用 host 事件流
- focused tests、README、OpenSpec 同步

## Out of Scope

- 新增新的事件类型
- 事件持久化
- scheduler / plugin runtime 事件接入

## 验收标准

- `AgentHost` 成为共享事件流的持有者。
- 共享同一 host 的多个 `AgentService` 不再维护各自独立事件总线。
- 现有 `session.created`、`chat.started`、`chat.completed`、`chat.failed` 语义保持不变。
