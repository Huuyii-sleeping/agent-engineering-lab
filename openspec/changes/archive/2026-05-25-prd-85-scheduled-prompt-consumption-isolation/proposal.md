## Why

普通 query preparation 会 tick scheduler 并 drain scheduled notifications。对于 `1s` 这类短延迟提醒，scheduled prompt 会在“设置提醒”的同一轮被提前消费，后台 Ink scheduler loop 后续查不到 due prompt，导致用户看不到主动提醒。

## What Changes

- `NotificationServiceLike.drainPendingQueryNotifications()` 支持 `includeScheduled` 选项。
- 普通 `prepareQueryRound()` 默认以 `includeScheduled: false` 收集动态通知。
- `QueryEngineRunInput` 增加 `includeScheduledNotifications`。
- `runScheduledRound()` 显式以 `includeScheduledNotifications: true` 运行。
- daemon-backed Ink scheduled tick 调用 `chat()` 时传入 `include_scheduled_notifications: true`。

## Impact

- 影响代码：runtime notification/preparation/query engine、service API chat、Ink scheduler controller。
- 影响测试：query preparation、query notifications、Ink scheduler 和 CLI scheduler 单元测试。
