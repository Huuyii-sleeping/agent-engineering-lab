# Design

## Overview

本次把 scheduler 从单纯 notification producer 收敛为 task lifecycle runtime。外部仍通过 `schedule_create`、`schedule_list`、`schedule_remove` 使用；内部增加 one-shot、history、lock 和 lifecycle metadata。

## Decisions

### Decision 1: 明确区分 cron 与 once 任务

`ScheduleRecord.kind` 使用 `"cron" | "once"`。当工具输入包含 `delay_ms` 或 `once_at` 时创建 `once`，并强制 `recurring: false`；否则继续创建 `cron`。这样“1 秒后提醒”不会被误表达成每秒循环。

### Decision 2: Store 负责 legacy migration

`SchedulerStore.loadRecords()` 在读取旧记录时补齐新字段：

- `kind` 默认 `"cron"`。
- `status` 从旧 `enabled` 映射。
- `last_run_at` 从旧 `last_fired_at` 映射。
- `run_count` 默认按是否有 `last_fired_at` 推断为 `0` 或 `1`。
- `next_run_at` 在 create/tick 时刷新；旧记录可为空，后续 tick 重新计算。

这样可以直接读取旧 `.schedule/records.json`。

### Decision 3: Best-effort tick lock

新增 `.schedule/lock.json`，内容包含 owner、pid、acquiredAt、expiresAt。tick 开始时尝试获得锁：

- 不存在或已过期时写入自己的 lock。
- 写入后重新读取确认 owner 匹配。
- 释放时只释放自己的 lock。

该锁是本地文件系统 best-effort 机制，用于避免多个 CLI/daemon 进程同时扫描产生重复通知。

### Decision 4: History 是排障面，不替代 notification queue

调度命中后仍写入 `notifications.json` 供 scheduled round 消费；同时写入 `history.json` 记录 fired 状态。history 默认保留最近 200 条，避免长期膨胀。

## Risks

- 文件锁不是跨网络文件系统的强一致锁。当前目标是本地 CLI/daemon 进程，best-effort 足够。
- cron next run 计算不做完整复杂语法支持，只在既有 parser 支持范围内做有界扫描。
- 旧记录 `run_count` 无法恢复准确历史，只做兼容性填充。
