## ADDED Requirements

### Requirement: Local runtime audit MUST be queryable through agent service for BFF
系统 MUST 允许 BFF 通过 agent service 只读查询本地 audit events，避免 BFF 直接读取 `.audit` 文件。

#### Scenario: Audit events endpoint returns bounded events
- **WHEN** BFF 调用 agent service `GET /audit/events`
- **THEN** agent service 返回 bounded audit events
- **AND** 支持 limit、session_id、trace_id 和 category 查询参数

