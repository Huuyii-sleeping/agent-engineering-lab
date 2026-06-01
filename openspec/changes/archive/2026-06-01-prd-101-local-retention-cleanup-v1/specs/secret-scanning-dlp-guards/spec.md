## ADDED Requirements

### Requirement: Secret scan findings MUST be cleanup-compatible
系统 MUST 允许本地 secret scan findings 按 security record retention contract 被清理，避免 `.security/secret-findings.json` 无界增长。

#### Scenario: Expired secret finding is removed by cleanup
- **WHEN** secret finding 的 `createdAt` 已超过 `security_record` retention window
- **THEN** 本地 retention cleanup 从 `.security/secret-findings.json` 删除该 finding
- **AND** 同文件中的未过期 finding 保持不变
