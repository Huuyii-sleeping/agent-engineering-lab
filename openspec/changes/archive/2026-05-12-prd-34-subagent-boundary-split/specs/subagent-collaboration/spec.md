## ADDED Requirements

### Requirement: Subagent lifecycle boundary refactors MUST preserve lifecycle and notification semantics
子代理生命周期边界重构 MUST 保持既有创建、派发、等待、查询、关闭、通知 drain 和错误契约语义不变，同时允许这些职责由 manager 承接。

#### Scenario: 保持异步派发与立即返回
- **WHEN** 模型调用 `subagent_send(agent_id, prompt)`
- **THEN** subagent manager 仍会立即返回 accepted，并把对应子代理状态切换为 `running`

#### Scenario: 保持等待超时语义
- **WHEN** 模型调用 `subagent_wait` 且在超时时间内子代理仍未结束
- **THEN** subagent manager 仍会返回 `WAIT_TIMEOUT` 错误，并保留当前 agent snapshot

#### Scenario: 保持完成/失败通知 drain 语义
- **WHEN** 子代理进入 `completed` 或 `failed`
- **THEN** subagent manager 仍会生成相同 shape 的通知记录，且 drain 后清空队列
