# scheduled-prompt-runtime Specification

## MODIFIED Requirements

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

## ADDED Requirements

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
