## ADDED Requirements

### Requirement: Audit cleanup controls MUST cover local audit journals

`.audit/events.jsonl` MUST 服从本地 retention / cleanup contract，避免安全审计数据在本地无限期增长或绕过显式清理语义。

#### Scenario: Cleanup processes expired audit events

- **WHEN** 本地 audit 事件超过声明的 retention 阈值
- **THEN** cleanup 能够删除、裁剪或归档对应 `.audit` 记录
- **AND** cleanup action 本身可被记录为审计事件摘要

#### Scenario: No-persistence disables new audit writes

- **WHEN** 本地持久化处于 disabled 或等价 no-persistence 姿态
- **THEN** 系统不写入新的 `.audit/events.jsonl` 事件
