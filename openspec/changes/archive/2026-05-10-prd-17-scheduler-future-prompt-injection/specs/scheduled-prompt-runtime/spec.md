## ADDED Requirements

### Requirement: Scheduler SHALL persist future prompt records
系统 SHALL 持久化未来 prompt 调度记录，并至少保存 `id`、`cron`、`prompt`、`recurring`、`durable`、`created_at`、`last_fired_at`。

#### Scenario: 创建调度后成功落盘
- **WHEN** 创建一条未来调度记录
- **THEN** 系统将记录写入持久化存储，并可在后续读取到同一记录

### Requirement: Scheduler SHALL scan schedules at minute granularity
系统 SHALL 以分钟级扫描调度记录，并判断当前分钟是否命中。

#### Scenario: 当前分钟命中调度
- **WHEN** 某条调度记录与当前分钟匹配
- **THEN** 系统将该命中转为 `scheduled_prompt` 通知，而不是立即后台执行

### Requirement: Scheduler notifications MUST be durable until drained
系统 MUST 将命中的 `scheduled_prompt` 放入通知队列，并在主循环 drain 前保持可恢复。

#### Scenario: 命中后进入通知队列
- **WHEN** 调度记录命中
- **THEN** 系统写入 `scheduled_prompt` 通知队列，供主循环下一轮消费

### Requirement: Scheduler MUST prevent duplicate firing within a short window
系统 MUST 通过 `last_fired_at` 或等效机制，避免同一调度在同一分钟内重复连发。

#### Scenario: 同一分钟内重复 tick
- **WHEN** 同一分钟内重复执行调度扫描
- **THEN** 同一调度不会重复生成新的 `scheduled_prompt`

### Requirement: Durable schedules SHALL survive process restart
当调度记录标记为 durable 时，系统 SHALL 在进程重启后恢复其后续调度能力。

#### Scenario: 重启后 durable 调度继续生效
- **WHEN** durable 调度已落盘且进程重启
- **THEN** 系统重新读取该调度，并在未来命中时继续生成通知
