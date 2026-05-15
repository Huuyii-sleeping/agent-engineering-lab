## MODIFIED Requirements

### Requirement: Production runtime SHALL support embedded and daemon-backed host deployment
生产运行时 SHALL 同时支持嵌入式宿主部署与 daemon-backed 长期宿主部署，以兼容当前本地前台执行流程并支持长期运行模式。

#### Scenario: 嵌入式模式运行
- **WHEN** 用户以前台方式启动 `agent-cli`
- **THEN** 系统仍可在当前进程内创建宿主并正常执行

#### Scenario: daemon 模式运行
- **WHEN** 用户以后台 daemon 模式启动 `agent-cli`
- **THEN** 系统创建长期宿主并允许其他交互表面复用其运行时能力

#### Scenario: 前台入口通过共享 daemon client 复用宿主
- **WHEN** interactive CLI、TUI、MCP 或其他前台入口检测到本地 daemon-backed host 可用
- **THEN** 它们通过稳定的 service API client 与统一的 daemon client resolver 复用现有宿主
- **AND** 不在各入口内部重复实现 lock/status/health probe 与会话同步逻辑

#### Scenario: daemon 不可复用时前台入口回退本地执行路径
- **WHEN** interactive CLI、TUI、MCP 或其他前台入口无法复用 daemon
- **THEN** 系统回退到当前进程内的 embedded host 或本地交互运行时
- **AND** 保持核心交互能力可用，而不是直接启动失败
