## ADDED Requirements

### Requirement: Tool boundary corrections MUST record adopted and deferred boundaries
工具层边界校正 MUST 在学习沉淀文档中记录本轮采纳的 catalog/executor 划分，以及暂不迁移或暂不重写的工具层边界。

#### Scenario: 完成 ToolService 二次收口
- **WHEN** 仓库完成 ToolService 内部边界拆分
- **THEN** 学习沉淀文档说明 catalog、executor、ToolService facade 的职责，并记录为什么不迁移 `ToolService` 文件位置
