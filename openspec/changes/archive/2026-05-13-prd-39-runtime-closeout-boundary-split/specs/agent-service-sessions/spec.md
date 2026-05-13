## ADDED Requirements

### Requirement: Agent service session helper refactors MUST preserve session isolation busy guard and summary shape
AgentService session helper 重构 MUST 保持 session history/runtime state 隔离、busy guard 和 session summary shape 不变。

#### Scenario: 创建 session
- **WHEN** AgentService 创建新 session
- **THEN** session 继续拥有独立 id、history、runtime state、createdAt、updatedAt 和 busy=false

#### Scenario: 返回 session summary
- **WHEN** HTTP service 或 chat 返回 session summary
- **THEN** summary 继续包含 id、createdAt、updatedAt、busy、messageCount 和 rounds

#### Scenario: busy session 拒绝并发请求
- **WHEN** 已有同一 session 正在执行 chat
- **THEN** AgentService 继续返回 `SESSION_BUSY`，不进入 query runtime
