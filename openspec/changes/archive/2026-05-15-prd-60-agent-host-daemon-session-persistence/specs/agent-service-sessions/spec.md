## ADDED Requirements

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
