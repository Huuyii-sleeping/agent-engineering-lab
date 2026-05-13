## ADDED Requirements

### Requirement: QueryModel boundary corrections MUST record adopted and deferred module splits
QueryModel 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 request、fallback、recovery 与 public orchestration 划分，以及暂不改变模型请求和恢复语义的原因。

#### Scenario: 完成 QueryModel 模型请求模块边界收口
- **WHEN** 仓库完成 QueryModel 模块边界拆分
- **THEN** 学习沉淀文档说明 request、fallback、recovery、public orchestration 的职责，并记录本轮保持 model policy、fallback、compact、continuation、backoff 和 stopReason 语义不变
