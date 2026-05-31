## Why

现有 scheduler 已经可用于本地 CLI/TUI 提醒，但还缺少生产运维所需的策略控制、管理工具、稳定写入和指标诊断。本变更把剩余 cron 生产化能力集中为一个本地生产级版本，提升可恢复性、可解释性和可管理性。

## What Changes

- In Scope:
  - 增加 cron misfire 策略：`fire_once`、`skip`、`catch_up`。
  - 为 catch-up 增加 `max_catch_up` 上限。
  - 增加 `schedule_pause`、`schedule_resume`、`schedule_update`。
  - 增加 `schedule_stats`。
  - store 写入改为临时文件 + rename 的原子替换。
  - history 增加 skipped 记录，用于记录 misfire skip 与 lease skip。
  - `schedule_explain` 增加策略字段和更明确 reason。
- Out of Scope:
  - 不引入外部数据库或消息队列。
  - 不实现跨机器分布式锁。
  - 不实现远端执行 ack。
  - 不改变 cron 表达式语义。
  - 不实现 timezone/DST 配置。

## Capabilities

### New Capabilities

### Modified Capabilities

- `scheduled-prompt-runtime`: 增强 cron misfire 策略、管理工具、统计诊断、history 与本地持久化可靠性。

## Impact

- 影响 `apps/agent-cli/src/tools/scheduler-*` 数据模型、store 写入、tick 行为和工具 schema。
- 影响 `apps/agent-cli/src/tools/base.ts` 工具注册。
- 增加 scheduler manager/store 单元测试。
- 不新增依赖，不改变既有 schedule 默认行为。
