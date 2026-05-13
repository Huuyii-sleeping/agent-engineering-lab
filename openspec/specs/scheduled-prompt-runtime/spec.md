# scheduled-prompt-runtime Specification

## Purpose
定义持久化调度运行时，用于保存未来提示词调度、按分钟扫描到期任务、去重触发结果，并向主循环投递可恢复且可持久化的通知。
## Requirements
### Requirement: Scheduler SHALL persist future prompt records
调度器 SHALL 持久化未来 prompt 调度记录，并至少保存 `id`、`cron`、`prompt`、`recurring`、`durable`、`created_at` 与 `last_fired_at` 字段。

#### Scenario: 创建调度后写入持久化记录
- **WHEN** 创建一条未来调度
- **THEN** 调度器将该记录写入持久化存储，并可在后续重新读取到同一条记录

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

