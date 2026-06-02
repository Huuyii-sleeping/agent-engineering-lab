## ADDED Requirements

### Requirement: Web-driven BFF endpoints MUST remain scoped to current UI needs
BFF MAY 随 Web Chat Console 的真实交互需要新增 endpoint，但新增 endpoint MUST 只服务当前页面闭环，并保持转发、聚合、DTO 适配或错误标准化职责。

#### Scenario: Web Chat requires a new BFF endpoint
- **WHEN** Web Chat v1 实现发现现有 BFF API 无法支撑当前页面交互
- **THEN** 可以在同一 change 中新增最小 BFF endpoint
- **AND** endpoint 必须有转发或错误处理测试

#### Scenario: Endpoint is unrelated to Chat v1
- **WHEN** 某个候选 BFF endpoint 不服务当前 Chat 页面闭环
- **THEN** 本变更不得实现该 endpoint
