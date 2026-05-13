## Purpose
定义 Agent 的最小 HTTP 服务层与多 session 隔离能力，使外部系统可以通过标准接口调用 Agent。
## Requirements
### Requirement: Agent service SHALL expose core HTTP endpoints
系统 SHALL 提供最小可用的 HTTP 服务接口，至少包括 `/health`、`/tools`、`/sessions` 和 `/chat`。

#### Scenario: 查询健康状态
- **WHEN** 外部系统调用 `GET /health`
- **THEN** 服务返回可解析的健康状态结果

#### Scenario: 调用 chat 接口
- **WHEN** 外部系统调用 `POST /chat`
- **THEN** 服务执行一次 Agent 会话轮次并返回 assistant 结果

### Requirement: Sessions SHALL isolate history and runtime state
服务中的每个 session SHALL 拥有独立的历史消息和运行时状态，不得与其他 session 串线。

#### Scenario: 两个 session 分别聊天
- **WHEN** 外部系统创建两个独立 session，并分别发送不同消息
- **THEN** 每个 session 只保留自己的历史和响应

### Requirement: Context tools MUST bind runtime context per execution
`compact` 与 `estimate_tokens` 所依赖的运行时上下文 MUST 按执行链绑定，而不是依赖全局单例。

#### Scenario: 并发 session 调用 context 工具
- **WHEN** 两个独立 session 在并发轮次中使用 context 相关工具
- **THEN** 每个工具调用只看到所属 session 的消息上下文

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
