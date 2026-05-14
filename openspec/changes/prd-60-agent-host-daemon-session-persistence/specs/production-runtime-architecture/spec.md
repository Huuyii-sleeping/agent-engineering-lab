## ADDED Requirements

### Requirement: Production runtime SHALL define a shared host layer above interaction surfaces
生产运行时 SHALL 在 entrypoints 与 query runtime 之上定义共享宿主层，用于承载长期 session、事件流与运行时生命周期，而不是仅由各交互表面直接拼装 runtime。

#### Scenario: 新入口接入共享宿主
- **WHEN** 系统新增一个 CLI、TUI、HTTP 或 MCP 入口
- **THEN** 该入口优先通过共享宿主接入运行时能力，而不是重新装配独立的 session 与 runtime 状态

### Requirement: Production runtime SHALL support embedded and daemon-backed host deployment
生产运行时 SHALL 同时支持嵌入式宿主部署与 daemon-backed 长期宿主部署，以兼容当前本地开发流程并支持长期运行模式。

#### Scenario: 嵌入式模式运行
- **WHEN** 用户以当前本地前台方式启动 `agent-cli`
- **THEN** 系统仍可在当前进程内创建宿主并正常执行

#### Scenario: daemon 模式运行
- **WHEN** 用户以后台 daemon 模式启动 `agent-cli`
- **THEN** 系统创建长期宿主并允许其他交互表面复用其运行时能力
