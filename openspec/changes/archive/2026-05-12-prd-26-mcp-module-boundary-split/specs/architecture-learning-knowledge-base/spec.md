## ADDED Requirements

### Requirement: MCP boundary corrections MUST record adopted and deferred module splits
MCP 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 config 与 protocol/output 划分，以及暂不拆分 client/registry 的原因。

#### Scenario: 完成 MCP 模块边界拆分
- **WHEN** 仓库完成 MCP config 与 protocol/output 模块拆分
- **THEN** 学习沉淀文档说明 config、protocol/output、client/registry 的职责，并记录为什么本轮不拆 `McpServerClient` 与 `McpRegistry`
