# PRD-86 Cron 任务生命周期重构

## 背景

当前 scheduler 已经能通过 cron 表达式生成 scheduled prompt notification，并由 Ink TUI 主动消费。但它仍然偏向“通知队列”实现：没有明确的一次性任务语义，没有运行历史、状态字段、跨进程 tick 锁，也无法在 `schedule_list` 中直接看到下一次运行和失败状态。

参考 Claude Code 源码目录中 `ScheduleCronTool`、`cronScheduler`、`cronTasks`、`cronTasksLock`、`useScheduledTasks` 等分层，本仓库需要把 cron 能力重构为更完整的任务生命周期模型。

## 目标

- `schedule_create` 支持明确的一次性提醒：`delay_ms` / `once_at`。
- 调度记录保存生命周期字段：任务类型、状态、下一次运行、最近运行、运行次数和最近错误。
- scheduler tick 使用本地锁避免多个进程同时触发同一批任务。
- 调度触发写入运行历史，便于排查“为什么没有提醒”。
- `schedule_list` 返回生命周期字段和近期历史，提升 TUI/CLI 可观测性。

## 非目标

- 不引入完整 Quartz cron 语法。
- 不实现后台 daemon 常驻推送的新协议。
- 不修改 scheduled prompt 消费隔离规则。
- 不下载或复制外部 Claude Code 仓库源码。

## 验收标准

- `delay_ms: 1000` 创建一次性任务，到期后只触发一次并自动 disabled。
- legacy scheduler record 能被迁移到新字段，不破坏旧 `.schedule/records.json`。
- 并发 tick 在 lock 未释放时不会重复生成 scheduled prompt。
- 调度触发后 `history.json` 持久化一条 fired 记录。
- `schedule_list` 暴露 `next_run_at`、`last_run_at`、`run_count`、`last_error`、`status` 和近期 history。
- `pnpm build`、相关 unit/smoke、OpenSpec status/validate 通过。
