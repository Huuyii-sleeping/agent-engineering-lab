## ADDED Requirements

### Requirement: Session persistence MUST protect sensitive history and runtime state
session 持久化 MUST 在写入 `.sessions/*.json` 前对高敏感文本执行脱敏或受保护存储，并附带生命周期元数据，避免完整历史消息与 runtime state 被无限期原样保留。

#### Scenario: Persisted session contains secret-like history
- **WHEN** session history 或 runtime state 中包含 token、password、api key 或等效敏感片段
- **THEN** 系统写入持久化文件时不直接保存原始敏感值
- **AND** 该 session 记录带有可用于后续 cleanup 的生命周期信息

### Requirement: Session persistence SHALL integrate with explicit cleanup controls
session 持久化 SHALL 接入统一 retention / cleanup contract，使单个 session 及其关联数据可以被显式删除、裁剪或过期清理。

#### Scenario: Session expires under retention policy
- **WHEN** 某个 session 达到声明的保留策略阈值
- **THEN** 系统清理该 session 的持久化记录或将其裁剪到允许范围内

