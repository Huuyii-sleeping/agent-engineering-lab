## ADDED Requirements

### Requirement: Team persistence SHALL include schema version with backward-compatible reads
团队成员与协议请求的持久化记录 MUST 包含 `schemaVersion`；系统 MUST 兼容读取旧结构数据。

#### Scenario: 旧团队记录兼容读取
- **WHEN** `teammates.json` 中记录缺少 `schemaVersion`
- **THEN** 系统成功读取并补齐默认版本，不中断功能

#### Scenario: 旧协议请求兼容读取
- **WHEN** `requests.json` 中记录缺少 `schemaVersion`
- **THEN** 系统成功读取并保持协议流程可用
