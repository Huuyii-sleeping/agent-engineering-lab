## ADDED Requirements

### Requirement: Agent service MUST provide BFF-compatible read endpoints
agent service MUST 提供 BFF 可转发的只读治理 endpoint，同时保持现有 session 与 chat endpoint 稳定。

#### Scenario: BFF reads session transcript through agent service
- **WHEN** BFF 调用 agent service 的 session detail endpoint
- **THEN** agent service 返回 session summary 与 transcript messages

#### Scenario: BFF reads runtime governance state through agent service
- **WHEN** BFF 调用 agent service 的 governance read endpoint
- **THEN** agent service 返回只读 JSON
- **AND** 不执行工具、不修改 session、不触发 agent run

