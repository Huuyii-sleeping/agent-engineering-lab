## ADDED Requirements

### Requirement: Tool executor boundary corrections MUST record dispatch and target execution decisions
工具 executor 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 dispatch、builtin executor 与 MCP executor 划分，以及暂不拆分的工具运行时边界。

#### Scenario: 完成 ToolExecutor 分发边界收口
- **WHEN** 仓库完成 ToolExecutor 内部边界拆分
- **THEN** 学习沉淀文档说明 dispatch、builtin executor、MCP executor 的职责，并记录为什么暂不拆 `runtime/tool-runtime.ts` 与 MCP client/registry
