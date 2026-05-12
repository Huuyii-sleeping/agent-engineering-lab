## ADDED Requirements

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
