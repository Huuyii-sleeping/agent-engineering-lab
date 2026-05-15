## MODIFIED Requirements

### Requirement: Foreground entrypoints SHALL reuse a running daemon when available
当前台交互表面检测到本地 daemon-backed host 可用时，系统 SHALL 优先 attach 到已有 daemon，并在不可复用时回退 embedded host 或本地交互运行时。

#### Scenario: interactive CLI 复用已存在的 daemon
- **WHEN** 用户启动默认 `agent-cli`
- **AND** 本地 daemon 已运行且 HTTP service ready
- **THEN** 系统优先 attach 到现有 daemon-backed service
- **AND** interactive CLI 复用共享 session、chat 和 tool surface，而不是继续维护一套只存在于当前进程的独立会话主链路

#### Scenario: daemon 不可复用时回退 embedded interactive CLI
- **WHEN** 用户启动默认 `agent-cli`
- **AND** daemon 未运行、只存在陈旧锁，或 attach / health probe 失败
- **THEN** 系统回退到当前进程内的 embedded CLI 运行时
- **AND** 保持现有 interactive CLI 基本能力可用

#### Scenario: TUI 复用已存在的 daemon
- **WHEN** 用户启动 `agent-cli tui`
- **AND** 本地 daemon 已运行且 HTTP service ready
- **THEN** 系统优先 attach 到现有 daemon-backed service
- **AND** TUI 复用共享 session、chat 和 tool surface，而不是在当前进程重新创建 embedded host

#### Scenario: daemon 不可复用时回退 embedded TUI
- **WHEN** 用户启动 `agent-cli tui`
- **AND** daemon 未运行、只存在陈旧锁，或 attach / health probe 失败
- **THEN** 系统回退到当前进程内的 embedded host
- **AND** 保持现有 TUI 基本能力可用

#### Scenario: MCP 复用已存在的 daemon
- **WHEN** 用户启动 `agent-cli mcp-server`
- **AND** 本地 daemon 已运行且 HTTP service ready
- **THEN** 系统优先 attach 到现有 daemon-backed service
- **AND** MCP 入口复用共享 session 与 chat surface，而不是在当前进程重新创建 embedded host

#### Scenario: daemon 不可复用时回退 embedded MCP
- **WHEN** 用户启动 `agent-cli mcp-server`
- **AND** daemon 未运行、只存在陈旧锁，或 attach / health probe 失败
- **THEN** 系统回退到当前进程内的 embedded host
- **AND** 保持现有 MCP 基本能力可用
