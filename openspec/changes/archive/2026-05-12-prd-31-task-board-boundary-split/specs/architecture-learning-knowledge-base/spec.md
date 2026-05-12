## ADDED Requirements

### Requirement: Task board boundary corrections MUST record adopted and deferred module splits
TaskBoard 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 types、store、manager 与 tool facade 划分，以及暂不继续拆 claim lock、autonomy 调用方或 worktree 调用方的原因。

#### Scenario: 完成 TaskBoard 任务模块边界收口
- **WHEN** 仓库完成 TaskBoard 内部边界拆分
- **THEN** 学习沉淀文档说明 types、store、manager、tool facade 的职责，并记录本轮保持任务状态机、claim 与 worktree sync 语义不变
