## Context

当前 daemon 入口已经把 `AgentHost`、HTTP service 与多入口 attach/reuse 串起来，但 lifecycle 语义还不完整：

- `runDaemon()` 通过 `DaemonLock.runExclusive()` 包住启动流程。
- 默认 `runServer()` 在 server 开始监听后立即返回，而不是等待 server 关闭。
- 这会导致 daemon 锁提前释放，后台进程仍存活时 `daemon status` 可能已经变成 `not_running`，前台 attach 也失去可信判断依据。

在这个状态下继续扩展 daemon 控制面，会把更多功能建立在错误的“运行状态”之上。这个变更先修正 lifecycle 基础，再补一个最小但真实可用的停止入口。

## Goals / Non-Goals

**Goals:**

- 让 daemon 锁覆盖 daemon 实际存活期，而不是只覆盖启动瞬间。
- 让 daemon 进程能够响应显式关闭请求，并在退出后释放锁。
- 提供 `agent-cli daemon stop` 本地控制入口，返回可判定的成功/失败结果。
- 用测试覆盖启动、停止、锁释放与 CLI 子命令解析。

**Non-Goals:**

- 不实现 daemon 自守护、自拉起或 detached launcher。
- 不引入新的远程管理 API、认证或权限模型。
- 不实现 `daemon restart`，避免在没有后台 self-spawn 机制时制造含糊语义。

## Decisions

### 1. daemon 锁从“启动期互斥”改为“进程生命周期租约”

决策：

- `DaemonLock` 继续负责 acquire/release/status，但 `runDaemon()` 不再用 `runExclusive()` 包住启动逻辑。
- daemon 启动时显式 `acquire()`，直到收到关闭信号并完成 server close 后再 `release()`。

原因：

- 当前 bug 的根源不是锁实现本身，而是锁持有范围不对。
- 保留现有 `DaemonLock` API 可以最小化改动，并继续复用已有 stale lock 处理逻辑。

备选方案：

- 保持 `runExclusive()`，把 `runServer()` 改成永不返回。
- 不采用原因：`runServer()` 目前既服务普通 `server` 模式，也服务 daemon 内部复用；把它硬改成阻塞式会让通用 HTTP 入口契约变差，并扩大影响面。

### 2. 引入可关闭的 server 句柄，而不是让 daemon 猜测 HTTP 生命周期

决策：

- `runServer()` 返回已监听的 server 句柄。
- daemon 入口基于 server 句柄注册 `SIGINT`/`SIGTERM` 关闭流程，并等待 `server.close()` 完成。

原因：

- daemon 需要知道“什么时候真正结束”，而不仅是“什么时候开始监听”。
- 直接复用 Node `Server` 的关闭能力，比额外包一层后台控制协议更简单，也更符合现有架构。

备选方案：

- 在 service API 内新增 `/shutdown` HTTP endpoint。
- 不采用原因：这会把本地进程管理问题升级成远程管理协议问题，还会引入额外权限和安全边界，本轮没有必要。

### 3. `daemon stop` 通过 PID 信号关闭本地 daemon

决策：

- `agent-cli daemon stop` 读取 lock status。
- 若状态为 `running`，向记录的 pid 发送 `SIGTERM`，并在短时间轮询 lock/status 直到确认 daemon 退出或超时。
- 若状态为 `not_running` 或 `stale`，直接返回非零退出码并输出清晰说明。

原因：

- 当前 daemon 只支持本机单实例运行，lock 文件已经是本机控制面的单一状态来源。
- 使用本机信号能复用现有 pid 记录，不需要引入新的管理 client。

备选方案：

- 通过 HTTP health/bridge 请求让 daemon 自行退出。
- 不采用原因：daemon 可能正处于 service 可达性异常但进程仍存活的状态，此时 PID 信号更底层、更可靠。

## Risks / Trade-offs

- [Risk] 不同平台的信号语义存在差异，尤其是 Windows。
  → Mitigation：当前实现先沿用 Node `process.kill(pid, "SIGTERM")` 的跨平台最小支持；如后续出现平台差异，再独立补 `terminateProcess()` 兼容层。

- [Risk] `daemon stop` 发送信号后如果 server 关闭卡住，锁不会及时释放。
  → Mitigation：stop 命令增加超时轮询，并把“信号已发送但未确认退出”明确反馈给调用方。

- [Risk] 普通 `server` 入口与 daemon 入口都依赖同一 `runServer()`，改返回值可能影响现有调用方。
  → Mitigation：保持 `await runServer()` 仍然合法，只是在返回值上新增 server 句柄，不改变现有调用代码的基本启动路径。
