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

### Requirement: Agent sessions SHALL be recoverable across host restarts
Agent service 中的 session SHALL 支持跨宿主重启恢复，而不是仅在当前进程内存中可用。

#### Scenario: 重启后恢复已有 session
- **WHEN** 宿主进程关闭后重新启动
- **THEN** 系统能够重新加载已持久化的 session，并继续提供 session detail 与后续 chat 能力

### Requirement: Session persistence MUST preserve session isolation
session 持久化 MUST 保持 session 之间的历史与运行时状态隔离，不得因为共享存储而发生串线。

#### Scenario: 两个 session 分别恢复
- **WHEN** 系统从持久化存储恢复多个 session
- **THEN** 每个 session 只恢复自己的历史和状态，不得混入其他 session 的消息或元数据

### Requirement: Session persistence MUST protect sensitive history and runtime state
session 持久化 MUST 在写入 `.sessions/*.json` 前对高敏感文本执行脱敏或受保护存储，并附带生命周期元数据，避免完整历史消息与 runtime state 被无限期原样保留。

#### Scenario: Persisted session contains secret-like history
- **WHEN** session history 或 runtime state 中包含 token、password、api key 或等效敏感片段
- **THEN** 系统写入持久化文件时不直接保存原始敏感值
- **AND** 该 session 记录带有可用于后续 cleanup 的生命周期信息

### Requirement: Session persistence SHALL integrate with explicit cleanup controls
session 持久化 SHALL 接入统一 retention / cleanup contract，使单个 session 及其关联数据可以被显式删除、裁剪或过期清理。

#### Scenario: Session expires under retention policy
- **WHEN** 某个 session 达到声明的保留策略阈值
- **THEN** 系统清理该 session 的持久化记录或将其裁剪到允许范围内

### Requirement: Session surfaces MUST disclose local persistence contracts
session 相关 surface MUST 明确披露本地会保存哪些会话数据，至少包括 session metadata、transcript/history、agent 或 subagent 状态摘要，以及它们各自的用途、保留语义与删除语义。

#### Scenario: User inspects session persistence
- **WHEN** 用户检查 session 数据治理信息
- **THEN** 系统列出当前本地保存的 session 相关数据类别及其主要用途
- **AND** 说明这些数据如何支持 resume、检索、标题生成、上下文连续性或其他本地功能

#### Scenario: Session retention contract is surfaced
- **WHEN** session 或 transcript 数据已经接入 retention / delete contract
- **THEN** 系统在治理信息中展示对应的保留与删除语义
- **AND** 不要求用户分别阅读底层持久化实现才能知道这些行为

