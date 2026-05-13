## ADDED Requirements

### Requirement: QueryToolStage boundary corrections MUST record adopted and deferred module splits
QueryToolStage 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 hooks、executor、task sync 与 stage orchestration 划分，以及暂不改变工具执行和 hook 语义的原因。

#### Scenario: 完成 QueryToolStage 工具执行阶段边界收口
- **WHEN** 仓库完成 QueryToolStage 模块边界拆分
- **THEN** 学习沉淀文档说明 hooks、executor、task sync、stage orchestration 的职责，并记录本轮保持 tool call order、tool result shape、hook blocked output、security event 和 task/todo sync 语义不变
