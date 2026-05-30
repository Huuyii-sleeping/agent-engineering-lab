# scheduled-prompt-runtime Specification

## Purpose
定义持久化调度运行时，用于保存未来提示词调度、按分钟扫描到期任务、去重触发结果，并向主循环投递可恢复且可持久化的通知。
## Requirements
### Requirement: Scheduler SHALL persist future prompt records

调度器 SHALL 持久化未来 prompt 调度记录，并至少保存 `id`、`kind`、`cron` 或 `once_at`、`prompt`、`recurring`、`durable`、`created_at`、`status`、`next_run_at`、`last_run_at`、`last_error` 与 `run_count` 字段。调度器 MUST 兼容旧记录中的 `enabled` 与 `last_fired_at` 字段。

#### Scenario: 创建 cron 调度后写入生命周期记录

- **WHEN** 创建一条 cron 调度
- **THEN** 调度器将该记录写入持久化存储
- **AND** 记录包含 enabled 状态、下一次运行时间和运行计数

#### Scenario: 创建一次性延迟提醒

- **WHEN** 使用 `delay_ms` 或 `once_at` 创建提醒
- **THEN** 调度器创建 `kind = "once"` 的 non-recurring 调度
- **AND** 到期触发后将该调度状态改为 disabled

#### Scenario: 读取旧 scheduler 记录

- **WHEN** 调度器读取仅包含 `cron`、`enabled` 与 `last_fired_at` 的旧记录
- **THEN** store 补齐生命周期字段
- **AND** 后续 tick 可以继续处理该记录

### Requirement: Scheduler SHALL scan schedules at minute granularity
调度器 SHALL 以分钟粒度扫描调度记录，并判断当前分钟是否命中某条调度。

#### Scenario: 调度命中当前分钟
- **WHEN** 某条调度记录与当前分钟匹配
- **THEN** 调度器生成一条 `scheduled_prompt` 通知，而不是立即执行该 prompt

### Requirement: Scheduler notifications MUST be durable until drained
调度器 MUST 将命中的 `scheduled_prompt` 通知持久化保存，直到主循环完成 drain。

#### Scenario: 命中的调度进入通知队列
- **WHEN** 某条调度记录被命中
- **THEN** 调度器将 `scheduled_prompt` 写入持久化通知队列，供主循环下一轮消费

### Requirement: Scheduler MUST prevent duplicate firing within a short window
调度器 MUST 通过 `last_fired_at` 或等效机制，避免同一条调度在同一分钟内重复触发。

#### Scenario: 同一分钟内发生多次 tick
- **WHEN** 调度器在同一分钟内重复执行 tick
- **THEN** 同一条调度不会重复生成新的 `scheduled_prompt` 通知

### Requirement: Durable schedules SHALL survive process restart
被标记为 durable 的调度 SHALL 在进程重启后继续生效。

#### Scenario: durable 调度在重启后恢复
- **WHEN** 一条 durable 调度已经持久化，随后进程重启
- **THEN** 调度器重新加载该调度，并在未来继续按命中结果生成通知

### Requirement: Scheduler boundary refactors MUST preserve prompt scheduling semantics
Scheduler 内部边界重构 MUST 保持既有 5-field / 6-field cron 语义、durable persistence、notification drain 与 duplicate firing guard 语义不变，同时允许这些职责分别由 cron、store 与 manager 承接。

#### Scenario: 保持 5-field 与 6-field cron 兼容
- **WHEN** 调度器创建或匹配 5-field / 6-field cron 表达式
- **THEN** scheduler cron 边界仍保持既有 second 默认值与匹配语义

#### Scenario: 保持 durable schedule 与 legacy timestamp 兼容
- **WHEN** 调度器重启后重新加载 durable schedule 或读取 legacy ISO timestamp 记录
- **THEN** scheduler store 仍会恢复原有记录并以数值毫秒时间戳参与后续 tick

#### Scenario: 保持 duplicate firing guard 与 one-shot disable 语义
- **WHEN** 同一秒内重复 tick，或 one-shot schedule 首次命中后再次遇到相同命中时刻
- **THEN** scheduler manager 仍会避免重复发射通知，并保持 non-recurring schedule 在首次命中后禁用

### Requirement: Runtime notification boundary corrections MUST preserve scheduled prompt injection semantics
Runtime notification 边界校正 MUST 保持 scheduled prompt drain、system message 注入文案、console summary 和 notification observability 语义不变。

#### Scenario: scheduled prompt 注入
- **WHEN** 存在待消费的 scheduled prompt notifications
- **THEN** 系统继续生成 `<scheduled_prompt>` block 与 scheduled prompt instruction，并追加到动态 system messages

#### Scenario: scheduled prompt 观测
- **WHEN** scheduled prompt notification 被收集
- **THEN** 系统继续记录 source 为 `schedule` 的 notification event，payload 保持 scheduleId、firedAt、recurring 和 prompt

### Requirement: Scheduler SHALL guard tick execution with a local task lock

调度器 tick MUST 在扫描任务前尝试获得本地 scheduler lock。若 lock 被其他未过期 owner 持有，本次 tick MUST 跳过扫描并且不得生成新的 scheduled prompt notification。

#### Scenario: 另一个进程持有未过期 lock

- **GIVEN** scheduler lock 已被其他 owner 持有且尚未过期
- **WHEN** 当前进程执行 tick
- **THEN** 当前 tick 不扫描任务
- **AND** 不写入 scheduled prompt notification

### Requirement: Scheduler SHALL persist run history for fired tasks

调度器 MUST 为每次命中的调度写入运行历史，至少包含 `id`、`scheduleId`、`prompt`、`status`、`startedAt`、`finishedAt` 与 `error`。

#### Scenario: 调度命中后记录 fired history

- **WHEN** 某条调度记录被命中并写入 scheduled prompt notification
- **THEN** 调度器写入一条 `status = "fired"` 的运行历史
- **AND** `schedule_list` 可以返回近期运行历史供排障查看

### Requirement: Scheduler SHALL guard due schedules with per-task leases

Scheduler tick 在处理 due schedule 前 SHALL 检查该 schedule 的 `lease_owner` 与 `lease_until`。如果 lease 未过期且 owner 不是当前 scheduler owner，tick MUST 跳过该 schedule 且不得生成 scheduled prompt notification。如果 lease 已过期，tick SHALL 允许当前 owner 接管并继续处理。

#### Scenario: active foreign lease prevents firing
- **WHEN** 一条 due schedule 被其他 owner 持有未过期 lease
- **THEN** 当前 tick 不生成该 schedule 的 scheduled prompt notification
- **AND** 该 schedule 的 run count 不增加

#### Scenario: stale lease can be recovered
- **WHEN** 一条 due schedule 的 lease 已过期
- **THEN** 当前 tick 可以接管该 lease 并生成 scheduled prompt notification
- **AND** 成功触发后清理该 schedule 的 lease 字段

### Requirement: Scheduler SHALL explain schedule firing state

Scheduler SHALL 提供 `schedule_explain` 工具，用于按 schedule id 返回结构化诊断信息。诊断结果 MUST 包含 schedule id、status、kind、due 状态、next/last run 时间、run count、last error、lease owner、lease deadline、lease active 判断、近期 history 与可读 reason。

#### Scenario: explain active lease
- **WHEN** 用户解释一条被其他 owner 未过期 lease 占用的 schedule
- **THEN** `schedule_explain` 返回 `ok = true`
- **AND** 返回的 reason 说明该 schedule 当前被 active lease 阻止触发

#### Scenario: explain missing schedule
- **WHEN** 用户解释一个不存在的 schedule id
- **THEN** `schedule_explain` 返回 `ok = false`
- **AND** error code 为 `SCHEDULE_NOT_FOUND`

### Requirement: Scheduler store SHALL migrate lease fields

Scheduler store SHALL 在读取 legacy schedule records 时补齐 `lease_owner` 与 `lease_until` 字段，缺失或非法值 MUST 转换为 `null`。

#### Scenario: legacy schedule without lease fields
- **WHEN** store 读取一条没有 lease 字段的 legacy schedule
- **THEN** 返回的 schedule record 包含 `lease_owner = null`
- **AND** 返回的 schedule record 包含 `lease_until = null`

