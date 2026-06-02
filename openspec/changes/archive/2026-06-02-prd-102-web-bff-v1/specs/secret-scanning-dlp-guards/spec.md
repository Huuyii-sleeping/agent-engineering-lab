## ADDED Requirements

### Requirement: Secret scan findings MUST be queryable through agent service for BFF
系统 MUST 允许 BFF 通过 agent service 只读查询本地 secret scan findings，避免 BFF 直接读取 `.security` 文件。

#### Scenario: Security findings endpoint returns tracked findings
- **WHEN** BFF 调用 agent service `GET /security/findings`
- **THEN** agent service 返回当前 tracked secret findings
- **AND** endpoint 不执行扫描、不修改 finding 状态
