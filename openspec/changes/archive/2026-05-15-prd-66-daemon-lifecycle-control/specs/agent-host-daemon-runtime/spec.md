## MODIFIED Requirements

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
- **AND** 当 daemon 正在运行时返回成功退出码，未运行或只存在陈旧锁时返回非零退出码

## ADDED Requirements

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
