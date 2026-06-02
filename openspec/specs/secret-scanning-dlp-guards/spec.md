# secret-scanning-dlp-guards Specification

## Purpose
TBD - created by archiving change prd-70-security-analysis-gap-closeout. Update Purpose after archive.
## Requirements
### Requirement: Tool outputs and workspace writes MUST be scanned for secret-like leakage
系统 MUST 在工具输出进入会话历史前、以及 workspace 写副作用完成后，对 secret-like 内容执行扫描，并根据规则执行阻断、降级、告警或审计，而不是仅依赖事后人工发现。

#### Scenario: Tool output contains a high-confidence secret
- **WHEN** 某次工具输出命中高置信 secret-like 规则
- **THEN** 系统阻止原文直接进入会话或文件落盘
- **AND** 返回经处理的结果与明确的安全反馈

#### Scenario: Workspace write introduces a secret-like value
- **WHEN** 写类工具在工作区中新增命中 secret-like 规则的内容
- **THEN** 系统记录对应发现
- **AND** 按策略执行 block、warn 或 audit-only 动作

### Requirement: Delivery validation MUST surface secret findings before completion
系统 MUST 在交付验证或提交前校验阶段汇总 secret scanning / DLP 发现，避免存在已知泄漏时仍被视为正常完成。

#### Scenario: Delivery validation sees unresolved secret findings
- **WHEN** 当前轮次存在未解决的高风险 secret finding
- **THEN** 交付验证结果标记为失败或需人工确认
- **AND** 输出中包含对应文件或来源摘要

### Requirement: Secret scan findings MUST be cleanup-compatible
系统 MUST 允许本地 secret scan findings 按 security record retention contract 被清理，避免 `.security/secret-findings.json` 无界增长。

#### Scenario: Expired secret finding is removed by cleanup
- **WHEN** secret finding 的 `createdAt` 已超过 `security_record` retention window
- **THEN** 本地 retention cleanup 从 `.security/secret-findings.json` 删除该 finding
- **AND** 同文件中的未过期 finding 保持不变

### Requirement: Secret scan findings MUST be queryable through agent service for BFF
系统 MUST 允许 BFF 通过 agent service 只读查询本地 secret scan findings，避免 BFF 直接读取 `.security` 文件。

#### Scenario: Security findings endpoint returns tracked findings
- **WHEN** BFF 调用 agent service `GET /security/findings`
- **THEN** agent service 返回当前 tracked secret findings
- **AND** endpoint 不执行扫描、不修改 finding 状态

