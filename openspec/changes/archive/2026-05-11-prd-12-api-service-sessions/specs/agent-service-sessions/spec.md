## ADDED Requirements

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
