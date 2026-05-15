## MODIFIED Requirements

### Requirement: Agent CLI SHALL support daemon mode
系统 SHALL 提供 `daemon` 运行模式，使 `agent-cli` 可以作为后台长期驻留进程运行，而不是仅限一次性前台执行。

#### Scenario: 启动 daemon
- **WHEN** 用户以 `daemon` 模式启动 `agent-cli`
- **THEN** 系统启动长期存在的 `AgentHost` 并保持进程存活，直到显式关闭

#### Scenario: 探测 daemon 是否存在
- **WHEN** 用户执行 `agent-cli daemon status`
- **THEN** 系统输出当前 daemon 状态
- **AND** 至少区分 `running`、`not_running` 和 `stale` 三种结果
- **AND** 当 daemon 正在运行时返回成功退出码，未运行或只存在陈旧锁时返回非零退出码

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
