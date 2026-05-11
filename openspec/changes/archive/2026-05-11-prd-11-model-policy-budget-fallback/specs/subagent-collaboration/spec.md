## ADDED Requirements

### Requirement: Subagents SHALL reuse the centralized model policy
子代理模型请求 SHALL 复用统一模型策略、预算守卫与 fallback 逻辑，而不是单独硬编码模型。

#### Scenario: 子代理请求命中统一策略
- **WHEN** 子代理发起模型请求
- **THEN** 系统按子代理对应角色路由模型，并记录相同的预算与模型选择信息
