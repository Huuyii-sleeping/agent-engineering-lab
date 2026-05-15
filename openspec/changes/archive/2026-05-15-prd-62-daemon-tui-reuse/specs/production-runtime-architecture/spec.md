## MODIFIED Requirements

### Requirement: Production runtime SHALL support embedded and daemon-backed host deployment
生产运行时 SHALL 同时支持嵌入式宿主部署与 daemon-backed 长期宿主部署，以兼容当前本地开发流程并支持长期运行模式。

#### Scenario: 嵌入式模式运行
- **WHEN** 用户以当前本地前台方式启动 `agent-cli`
- **THEN** 系统仍可在当前进程内创建宿主并正常执行

#### Scenario: daemon 模式运行
- **WHEN** 用户以后台 daemon 模式启动 `agent-cli`
- **THEN** 系统创建长期宿主并允许其他交互表面复用其运行时能力

#### Scenario: 前台入口通过共享 service client 复用 daemon
- **WHEN** TUI 检测到本地 daemon-backed host 可用
- **THEN** 前台入口通过稳定的 service API client 复用现有宿主
- **AND** 不在入口内部散落实现一套独立的 HTTP 调用与会话同步逻辑
