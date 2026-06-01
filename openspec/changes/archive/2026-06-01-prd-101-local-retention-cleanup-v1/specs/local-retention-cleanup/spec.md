## ADDED Requirements

### Requirement: Local retention cleanup MUST prune expired known artifacts
系统 MUST 提供本地 retention cleanup 能力，仅清理已知本地运行产物中的过期记录，且不得递归删除未知文件或用户自定义路径。

#### Scenario: Audit JSONL cleanup prunes expired rows
- **WHEN** `.audit/events.jsonl` 同时包含已过期和未过期的有效审计事件
- **THEN** cleanup 后文件中只保留未过期事件
- **AND** cleanup summary 记录扫描、保留和删除数量

#### Scenario: Observability JSONL cleanup prunes legacy expired rows
- **WHEN** `.observability/events.jsonl` 包含没有 `expiresAt` 但 `at` 已超过 retention window 的旧事件
- **THEN** cleanup 按 `observability_event` retention contract 删除该事件
- **AND** 未过期事件仍然保留

#### Scenario: Secret findings cleanup prunes expired findings
- **WHEN** `.security/secret-findings.json` 包含已超过 `security_record` retention window 的 finding
- **THEN** cleanup 删除过期 finding
- **AND** 未过期 finding 仍然保留

### Requirement: Local retention cleanup MUST produce an auditable summary
系统 MUST 为每次本地 cleanup 返回结构化摘要，并在本地持久化启用时写入 retention 类 audit event。

#### Scenario: Cleanup result is audited
- **WHEN** cleanup 完成本地 artifact 清理
- **THEN** 系统写入一条 `retention` 类 audit event
- **AND** audit metadata 包含每类 artifact 的 deleted、kept 和 skipped 计数

#### Scenario: Cleanup respects disabled persistence
- **WHEN** 本地持久化配置为 disabled
- **THEN** cleanup 不创建 `.audit`、`.observability` 或 `.security` 运行产物
- **AND** cleanup 返回空操作摘要
