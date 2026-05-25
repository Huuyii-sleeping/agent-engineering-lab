## Context

Scheduled prompt 有两种消费方式：

- 普通用户 query round 中作为动态 system message 被注入；
- scheduler loop 到期后主动触发 scheduled round。

在 Ink CLI 已经有主动 scheduler loop 后，第一种路径会和第二种路径竞争同一个 pending scheduled notification 队列，导致短延迟提醒被普通轮次提前 drain。

## Decisions

### Decision 1: 默认不在普通 query round 消费 scheduled prompt

选择：`prepareQueryRound()` 默认传 `includeScheduled: false`。

理由：scheduled prompt 的用户体验目标是“到期主动提醒”，不应被设置提醒或其他普通请求轮次提前消费。

### Decision 2: scheduled round 显式 opt-in

选择：`QueryEngineRunInput` 增加 `includeScheduledNotifications`，`runScheduledRound()` 设置为 `true`。

理由：scheduled round 是唯一应该 drain scheduled prompt 的路径；显式字段比从 prompt 文案推断更稳定。

### Decision 3: daemon chat 请求透传 scheduled 消费意图

选择：HTTP chat request 增加 `include_scheduled_notifications`。

理由：Ink CLI 连接 daemon 时无法直接访问远端 query engine，但可以通过 chat request 明确告诉远端这轮是 scheduled consumption round。

## Risks

- [Risk] 没有后台 scheduler loop 的入口不会自动消费 scheduled prompt。Mitigation：当前交互入口已补 scheduler loop；headless/print 不承诺主动提醒。
