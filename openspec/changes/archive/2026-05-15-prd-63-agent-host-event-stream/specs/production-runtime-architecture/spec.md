## MODIFIED Requirements

### Requirement: Production runtime SHALL define a shared host layer above interaction surfaces
生产运行时 SHALL 在 entrypoints 与 query runtime 之上定义共享宿主层，用于承载长期 session、事件流与运行时生命周期，而不是仅由各交互表面直接拼装 runtime。

#### Scenario: 新入口接入共享宿主
- **WHEN** 系统新增一个 CLI、TUI、HTTP 或 MCP 入口
- **THEN** 该入口优先通过共享宿主接入运行时能力，而不是重新装配独立的 session 与 runtime 状态

#### Scenario: 共享宿主也共享事件流
- **WHEN** 多个 `AgentService` 或前台入口复用同一个 `AgentHost`
- **THEN** 它们通过同一宿主级事件流观察会话创建与 chat 生命周期
- **AND** 事件编号和订阅语义不再按 service instance 分裂
