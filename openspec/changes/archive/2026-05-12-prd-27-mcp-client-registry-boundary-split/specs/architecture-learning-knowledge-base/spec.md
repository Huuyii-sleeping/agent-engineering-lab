## ADDED Requirements

### Requirement: MCP client registry boundary corrections MUST record combined split decisions
MCP client/registry 边界校正 MUST 在学习沉淀文档中记录本轮合并拆分 client 与 registry 的原因，以及 public API facade 保留的边界。

#### Scenario: 完成 MCP client 与 registry 边界拆分
- **WHEN** 仓库完成 MCP client 与 registry 模块拆分
- **THEN** 学习沉淀文档说明 client、registry、public API facade 的职责，并记录为什么这轮将 client 和 registry 合并执行
