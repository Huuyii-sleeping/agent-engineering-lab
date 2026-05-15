# agent-host-daemon-runtime Specification

## Purpose
定义 `AgentHost`、daemon 运行模式与多入口共享宿主的最小平台契约，使长期宿主、状态探测与 attach/reuse 语义具备稳定规格。

## Requirements
### Requirement: Agent CLI SHALL define a long-lived AgentHost boundary
系统 SHALL 提供长期存在的 `AgentHost` 宿主边界，用于统一承载 runtime services、query engine、session registry 与事件流，而不是让各个入口各自独立装配运行时。

#### Scenario: 多入口共享同一宿主
- **WHEN** 两个或更多交互入口复用同一个 `AgentHost`
- **THEN** 它们共享同一份 session registry 与宿主级事件流
- **AND** 不要求每个 `AgentService` 实例再维护独立事件总线

### Requirement: Agent CLI SHALL support daemon mode
系统 SHALL 提供 `daemon` 运行模式，使 `agent-cli` 可以作为后台长期驻留进程运行，而不是仅限一次性前台执行。

#### Scenario: 启动 daemon
- **WHEN** 用户以 `daemon` 模式启动 `agent-cli`
- **THEN** 系统启动长期存在的 `AgentHost` 并保持进程存活，直到显式关闭
- **AND** daemon 锁在后台进程存活期间持续保持，不得在 HTTP service 刚开始监听后提前释放

#### Scenario: 探测 daemon 是否存在
- **WHEN** 用户执行 `agent-cli daemon status`
- **THEN** 系统输出当前 daemon 状态
- **AND** 至少区分 `running`、`not_running` 和 `stale` 三种结果
- **AND** 当 daemon 进程存在时继续探测共享 service 是否 ready
- **AND** 当 daemon 正在运行且 service ready 时返回成功退出码
- **AND** 当 daemon 未运行、只存在陈旧锁，或进程存在但 service 不可用时返回非零退出码

### Requirement: Agent CLI SHALL support explicit local daemon stop control
系统 SHALL 提供显式本地 daemon 停止控制，使维护者能够关闭正在运行的 daemon，并在关闭后观察到状态收敛。

#### Scenario: 停止正在运行的 daemon
- **WHEN** 用户执行 `agent-cli daemon stop`
- **AND** 本地 daemon 正在运行
- **THEN** 系统向记录的 daemon 进程发送终止信号
- **AND** 等待 daemon 释放锁或确认进程退出
- **AND** 在成功停止后返回成功退出码

#### Scenario: 停止不存在的 daemon
- **WHEN** 用户执行 `agent-cli daemon stop`
- **AND** 本地 daemon 未运行或只存在陈旧锁
- **THEN** 系统输出明确错误信息
- **AND** 返回非零退出码

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
