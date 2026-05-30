# PRD-93 Cron Misfire 与 NextRun 触发

## 背景

当前 cron 调度已经具备持久化、全局 tick lock、任务级 lease、history 和 `schedule_explain`。但 cron 命中仍主要依赖 `cronMatches(record.cron, now)`，也就是 tick 必须刚好运行在表达式命中的那一秒。如果 TUI/daemon 轮询晚到几百毫秒或数秒，原本应该触发的 cron 可能被错过。

生产级 cron 的下一步应先把触发判断切换到 `next_run_at` 语义：创建或扫描时计算下一次运行时间，tick 到达时只要 `next_run_at <= now` 就认为 due，触发一次后再推进到未来。

## 目标

- cron schedule 使用 `next_run_at <= now` 判断 due，避免 tick 晚到导致提醒丢失。
- cron schedule 首次创建时继续保存 `next_run_at`。
- tick 未到期时继续推进或保持 `next_run_at`，保证后续判断稳定。
- cron schedule 迟到触发后只补发一次，不回放所有错过周期。
- 触发后 `next_run_at` 必须推进到当前 tick 之后的下一次 cron 时间。
- `schedule_explain` 能识别 `next_run_at <= now` 的 overdue due 状态，并给出可读 reason。

## 非目标

- 不实现多次 catch-up 回放。
- 不实现 retry/backoff。
- 不实现 misfire grace 配置。
- 不实现 daemon 主动推送。
- 不改变 5-field / 6-field cron 解析语义。

## 验收标准

- 每秒 cron 如果 tick 晚 500ms，仍会触发一次 notification。
- 触发后 `next_run_at` 推进到当前 tick 之后，而不是停留在已错过时间。
- 同一个 tick 秒内不会重复触发。
- `schedule_explain` 对 overdue cron 返回 `due = true` 且 reason 说明 `next_run_at` 已到期。
- `pnpm --dir apps/agent-cli test`、`pnpm build`、OpenSpec status/validate 通过。
