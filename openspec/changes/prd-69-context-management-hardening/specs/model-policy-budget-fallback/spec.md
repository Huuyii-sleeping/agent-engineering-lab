# model-policy-budget-fallback Delta

## MODIFIED Requirements

### Requirement: System SHALL record model selection and estimated cost

系统 SHALL 为每次模型请求记录命中的模型、角色、延迟、token 统计与 estimated cost，并使用运行时配置控制 completion token 上限。

#### Scenario: 请求使用配置化 completion token

- **WHEN** QueryModel 发起模型请求
- **THEN** request 中的 `max_tokens` 使用 `modelMaxCompletionTokens`
