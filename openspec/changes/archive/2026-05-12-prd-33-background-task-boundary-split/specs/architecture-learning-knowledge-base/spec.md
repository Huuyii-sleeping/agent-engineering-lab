## ADDED Requirements

### Requirement: Background task boundary corrections MUST record adopted and deferred module splits
BackgroundTask 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 types、runner、manager 与 tool facade 划分，以及暂不引入持久化或不顺手重构 subagent 的原因。

#### Scenario: 完成 BackgroundTask 后台任务模块边界收口
- **WHEN** 仓库完成 BackgroundTask 内部边界拆分
- **THEN** 学习沉淀文档说明 types、runner、manager、tool facade 的职责，并记录本轮保持后台任务语义不变
