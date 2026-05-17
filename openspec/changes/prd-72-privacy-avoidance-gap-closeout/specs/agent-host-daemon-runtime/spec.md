## ADDED Requirements

### Requirement: Foreground entrypoints MUST support an explicit local-only non-attach posture
当前台入口启用 `local_only` 或等价隐私最小化姿态时，系统 MUST 禁止 interactive CLI、TUI 与 MCP 入口自动 attach 到已存在的 daemon-backed host，避免在用户未显式同意的情况下扩大到长期宿主与 bridge ingress 边界。

#### Scenario: Interactive CLI runs in local-only mode
- **WHEN** 用户以 `local_only` 或等价隐私姿态启动默认 `agent-cli`
- **THEN** 系统在当前进程内运行 embedded host 或等价本地运行时
- **AND** 即使检测到 daemon 可用也不得自动 attach

#### Scenario: TUI or MCP runs in local-only mode
- **WHEN** 用户以 `local_only` 或等价隐私姿态启动 `agent-cli tui` 或 `agent-cli mcp-server`
- **THEN** 系统不得复用已有 daemon-backed host
- **AND** 不主动扩大到 bridge / event replay / shared session 边界
