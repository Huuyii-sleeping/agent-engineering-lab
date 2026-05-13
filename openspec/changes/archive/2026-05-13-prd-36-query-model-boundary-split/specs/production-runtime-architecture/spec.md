## ADDED Requirements

### Requirement: QueryModel internals MUST separate request fallback recovery and public orchestration boundaries
QueryModel 内部 MUST 区分 request、fallback、recovery 与 public orchestration，使请求构造、模型降级、恢复动作和主编排可以独立演进。

#### Scenario: 调整模型请求构造
- **WHEN** 系统调整 request messages、OpenAI request shape 或 response 归一化
- **THEN** 维护者主要修改 query model request 边界，而不是修改 fallback 或 recovery 边界

#### Scenario: 调整模型 fallback
- **WHEN** 系统调整 fallback model selection、fallback retry 或 usage finalize
- **THEN** 维护者主要修改 query model fallback 边界，而不是修改 request message 构造或 recovery selector

#### Scenario: 读取 QueryModel public orchestration
- **WHEN** 维护者阅读 `runtime/query-model.ts`
- **THEN** 该文件主要表达 public `requestQueryModel` 编排，而不是直接承载 request、fallback 和 recovery 的全部细节
