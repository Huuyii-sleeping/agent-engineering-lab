## ADDED Requirements

### Requirement: Local runtime audit MUST record retention cleanup actions
系统 MUST 将本地 retention cleanup 作为关键治理动作写入 audit ledger，记录清理目标、结果和计数摘要。

#### Scenario: Retention cleanup audit event is persisted
- **WHEN** 本地 retention cleanup 执行并删除或扫描运行产物
- **THEN** `.audit/events.jsonl` 追加一条 category 为 `retention` 的事件
- **AND** 事件 metadata 不包含未脱敏的敏感字段

