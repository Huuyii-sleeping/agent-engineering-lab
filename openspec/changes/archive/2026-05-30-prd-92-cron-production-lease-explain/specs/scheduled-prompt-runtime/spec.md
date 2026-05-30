## ADDED Requirements

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
