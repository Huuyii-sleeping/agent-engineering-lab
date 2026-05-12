## ADDED Requirements

### Requirement: Subagent boundary corrections MUST record adopted and deferred module splits
Subagent 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 types、executor、manager 与 tool facade 划分，以及暂不引入持久化、取消执行或更细 notification store 的原因。

#### Scenario: 完成 Subagent 子代理模块边界收口
- **WHEN** 仓库完成 Subagent 内部边界拆分
- **THEN** 学习沉淀文档说明 types、executor、manager、tool facade 的职责，并记录本轮保持工具权限、通知语义和 in-memory 生命周期不变
