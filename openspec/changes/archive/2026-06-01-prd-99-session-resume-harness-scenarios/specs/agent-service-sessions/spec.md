## ADDED Requirements

### Requirement: Service-level session resume MUST be covered by local production harness

Agent service 的 session resume 能力 MUST 通过本地生产级 harness 验证，证明持久化 session 在宿主重启后仍可恢复并继续进入 AgentService / QueryEngine chat 链路。

#### Scenario: Resume session and continue chat after service restart

- **WHEN** 本地 harness 创建 session、完成首轮 chat、销毁服务实例并使用同一持久化目录重建服务实例
- **THEN** 新服务实例能够恢复同一个 session id
- **AND** 后续 chat 继续追加到同一 session history
- **AND** runtime state 保持连续而不是重新初始化为无历史状态

#### Scenario: Resume preserves isolation across multiple sessions

- **WHEN** 本地 harness 持久化两个不同 session 并在重启后分别恢复
- **THEN** 每个 session 只包含自己的 history、runtime state 与 metadata
- **AND** 任一 session 的后续 chat 不得混入另一个 session 的消息或状态

#### Scenario: Resume uses append-only journal during service-level chat

- **WHEN** 本地 harness 对同一 session 在重启前后各完成至少一次 chat
- **THEN** session journal 包含多条可解析记录
- **AND** 最新恢复状态来自 journal 中的最后一个有效 session 记录
