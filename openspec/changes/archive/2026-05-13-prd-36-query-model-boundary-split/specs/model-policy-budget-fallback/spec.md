## ADDED Requirements

### Requirement: QueryModel boundary corrections MUST preserve model policy budget and fallback semantics
QueryModel 边界校正 MUST 保持 model selection、budget deny、fallback once 与 usage finalize 的现有语义不变。

#### Scenario: 模型预算拒绝
- **WHEN** model policy 返回 `budgetAction: "deny"`
- **THEN** 系统继续追加相同的预算拒绝 assistant message，并返回 `model_budget_denied`

#### Scenario: 主模型瞬时失败后 fallback
- **WHEN** 主模型请求失败且错误可 fallback，并且 policy 提供 fallback model
- **THEN** 系统继续执行一次 fallback request，并按既有语义记录 fallback selection 与 usage finalize

#### Scenario: fallback 无可用响应
- **WHEN** fallback request 失败或返回空响应
- **THEN** 系统继续进入既有 recovery selector，而不是把 fallback 空响应当成成功结果
