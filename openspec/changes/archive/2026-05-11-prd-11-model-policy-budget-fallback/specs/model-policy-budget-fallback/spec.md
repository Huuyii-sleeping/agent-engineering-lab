## ADDED Requirements

### Requirement: Model policy SHALL route requests by role
系统 SHALL 按 `planning`、`coding`、`review`、`ops` 四类角色路由模型，而不是所有请求都固定使用同一个模型。

#### Scenario: coding 请求命中 coding 模型
- **WHEN** 主循环发起 coding 类模型请求
- **THEN** 系统使用 coding 角色对应的模型策略

### Requirement: Model policy SHALL enforce session and daily budgets
系统 SHALL 对模型请求执行 session 与 daily 两级预算守卫，并在预算超限时明确返回原因。

#### Scenario: 预算超限后拒绝或降级
- **WHEN** 请求将导致 session 或 daily budget 超限
- **THEN** 系统先尝试更低成本 fallback，若仍不满足则拒绝请求并返回预算原因

### Requirement: Model policy SHALL fallback once on transient model failure
当主模型遭遇瞬时请求失败时，系统 SHALL 在存在备选模型时执行一次 fallback，而不是直接终止。

#### Scenario: 主模型失败后切到 fallback
- **WHEN** 当前角色主模型请求失败且存在 fallback 模型
- **THEN** 系统切换到该角色 fallback 模型并重试一次

### Requirement: System SHALL record model selection and estimated cost
系统 SHALL 为每次模型请求记录命中的模型、角色、延迟、token 统计与 estimated cost。

#### Scenario: 请求完成后写入模型指标
- **WHEN** 一次模型请求完成
- **THEN** observability 中包含所选模型、角色、延迟和 estimated cost
