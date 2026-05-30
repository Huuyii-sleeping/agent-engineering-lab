## Why

当前 cron tick 必须刚好运行在 cron 表达式命中的那一秒，轮询晚到时可能丢失提醒。PRD-92 已补齐任务级 lease 和 explain，本轮继续把 cron due 判断切换到生产更常见的 `next_run_at` 驱动，提升本地 TUI/daemon 轮询容错。

## What Changes

- In Scope:
  - cron schedule 使用 `next_run_at <= now` 作为 due 判断。
  - cron schedule 在 tick 晚到时补发一次 scheduled prompt notification。
  - 成功触发后将 `next_run_at` 推进到当前 tick 之后的下一次 cron 命中时间。
  - `schedule_explain` 使用相同 due 判断，并对 overdue `next_run_at` 给出可读 reason。
  - 补充单元测试覆盖 late tick、next_run_at 推进、explain overdue。
- Out of Scope:
  - 不做多周期 catch-up 回放。
  - 不做 retry/backoff。
  - 不做 misfire grace 配置。
  - 不做 daemon push。

## Capabilities

### New Capabilities

### Modified Capabilities

- `scheduled-prompt-runtime`: cron due 判断从仅匹配当前时刻扩展为 `next_run_at` 到期触发，并在触发后推进下一次运行时间。

## Impact

- 影响 `apps/agent-cli/src/tools/scheduler-manager.ts` 的 due 判断、next run 推进和 explain reason。
- 影响 scheduler 单元测试。
- 不新增依赖，不改变外部工具 schema。
