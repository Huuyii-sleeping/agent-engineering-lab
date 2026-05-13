## ADDED Requirements

### Requirement: Runtime closeout boundary corrections MUST record combined closeout decisions
Runtime 剩余边界总收口 MUST 在学习沉淀文档中记录本轮合并处理 QueryEngine、QueryNotifications、QueryRuntime 和 AgentService session helper 的原因，以及暂不继续拆分 HTTP route、release scripts 或 query stage runner 的原因。

#### Scenario: 完成 runtime 剩余编排边界总收口
- **WHEN** 仓库完成 PRD-39 runtime closeout
- **THEN** 学习沉淀文档说明 engine round、notification formatter/recorder、user prompt submit、service session helper 的职责，并记录本轮保持 query loop、notification、hook、session 和 release gate 语义不变
