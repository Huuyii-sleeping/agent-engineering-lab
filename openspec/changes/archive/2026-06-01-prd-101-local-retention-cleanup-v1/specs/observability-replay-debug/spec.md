## ADDED Requirements

### Requirement: Local observability events MUST carry retention metadata
系统 MUST 为新写入的本地 observability events 附带可清理的 retention metadata；对于历史事件，cleanup MUST 能通过 `at` 字段兼容计算过期时间。

#### Scenario: New observability event includes expiresAt
- **WHEN** 系统写入新的 `.observability/events.jsonl` 事件
- **THEN** 事件包含 `expiresAt`
- **AND** `expiresAt` 基于 `observability_event` retention contract 计算

#### Scenario: Legacy observability event is cleanup-compatible
- **WHEN** 历史 observability event 没有 `expiresAt`
- **THEN** cleanup 使用 `at + retentionDays` 判断是否过期

