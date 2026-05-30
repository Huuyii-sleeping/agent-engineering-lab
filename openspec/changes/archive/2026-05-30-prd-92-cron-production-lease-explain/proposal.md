## Why

当前 scheduler 已能创建和触发本地定时提醒，但缺少任务级 lease 与面向排障的 explain 能力。用户在 TUI 中遇到“为什么没有提醒我”时，只能看到 notification 或 history，无法判断 schedule 是否 due、是否被其他 tick 占用、是否已禁用。

本次改动先补齐生产级 cron 的关键基础：单任务租约与结构化诊断，为后续 retry/backoff、misfire 补偿和 daemon 推送继续铺路。

## What Changes

- In Scope:
  - `ScheduleRecord` 增加 `lease_owner` 与 `lease_until` 字段。
  - scheduler store 兼容历史 records，缺失 lease 字段迁移为 `null`。
  - scheduler tick 在触发 due schedule 前 claim 任务级 lease。
  - scheduler tick 跳过其他 owner 持有的未过期 lease，并允许接管过期 lease。
  - 成功触发或禁用后清理 schedule lease。
  - 新增 `schedule_explain` 工具，返回 schedule 状态、due 判断、lease 状态、近期 history 与可读 reason。
- Out of Scope:
  - 不实现 retry/backoff。
  - 不实现 misfire 补偿策略。
  - 不实现后台 daemon 主动事件推送。
  - 不修改 cron 表达式解析语义。

## Capabilities

### New Capabilities

### Modified Capabilities

- `scheduled-prompt-runtime`: 增加任务级 lease 与 schedule explain 诊断行为。

## Impact

- 影响 `apps/agent-cli/src/tools/scheduler-*` 的调度数据模型、tick 行为和工具暴露。
- 影响 `apps/agent-cli/src/tools/base.ts` 的工具注册与分发。
- 增加 scheduler unit/store 测试覆盖。
- 不新增运行时依赖，不改变现有用户命令入口。
