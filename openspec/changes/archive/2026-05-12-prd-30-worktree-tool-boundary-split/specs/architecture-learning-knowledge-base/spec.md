## ADDED Requirements

### Requirement: Worktree boundary corrections MUST record adopted and deferred module splits
Worktree 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 store、runner、manager 与 tool facade 划分，以及暂不改变 closeout 和 task sync 语义的原因。

#### Scenario: 完成 Worktree 工具模块边界收口
- **WHEN** 仓库完成 Worktree 工具模块边界拆分
- **THEN** 学习沉淀文档说明 store、runner、manager、tool facade 的职责，并记录本轮保持 dirty guard、closeout 和 task sync 语义不变
