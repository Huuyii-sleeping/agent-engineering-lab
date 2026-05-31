# PRD-94 Cron 生产级加固

## 背景

当前 cron 已具备本地可用的核心能力：持久化 schedule/notification/history、one-shot、5/6-field cron、全局 tick lock、任务级 lease、`next_run_at` due 判断和 `schedule_explain`。剩余差距主要集中在生产运维能力：misfire 策略、任务管理、运行指标、稳定写入和可诊断 history。

本 PRD 将这些能力集中在一个本地生产级版本中实现。由于当前架构没有远端执行 ack 或独立消息队列，本轮不伪造“执行成功确认”，而是把本地 scheduler 做到可靠、可恢复、可解释、可管理。

## 目标

- 为 cron schedule 增加 misfire 策略：
  - `fire_once`：默认策略，错过多个周期时只补发一次。
  - `skip`：错过后跳过本次，推进到未来，并记录 skipped history。
  - `catch_up`：按错过周期补发，受 `max_catch_up` 上限保护。
- 新增 schedule 管理工具：
  - `schedule_pause`
  - `schedule_resume`
  - `schedule_update`
- 新增 scheduler 诊断指标：
  - `schedule_stats`
  - 返回 schedule 数量、enabled/disabled 数量、pending notification 数、history 数、active lease 数、overdue 数、last tick 信息。
- store 写入改为原子写入，降低 JSON 部分写入损坏风险。
- history 增强 skipped 记录，用于解释 misfire skip 和 lease skip。
- `schedule_explain` 返回策略字段和更完整 reason。

## 非目标

- 不引入数据库、Redis、消息队列或外部 daemon 协议。
- 不实现跨机器分布式锁。
- 不实现远端执行 ack。
- 不改变 cron 解析语法。
- 不做复杂 timezone / DST 策略；当前仍使用本地 `Date` 语义。

## 验收标准

- legacy schedule 自动补齐 misfire 策略字段。
- `misfire_policy = skip` 的 overdue cron 不生成 notification，记录 skipped history，并推进 `next_run_at`。
- `misfire_policy = catch_up` 的 overdue cron 按 `max_catch_up` 生成多条 notification，并推进 `next_run_at`。
- pause 后 schedule 不触发，resume 后可继续触发。
- update 可修改 prompt/cron/recurring/misfire 策略，并重算 `next_run_at`。
- `schedule_stats` 返回可用于排障的结构化指标。
- store 写入使用临时文件 + rename 原子替换。
- `pnpm --dir apps/agent-cli test`、`pnpm --dir apps/agent-cli run test:scheduler`、`pnpm build`、OpenSpec status/validate 通过。
