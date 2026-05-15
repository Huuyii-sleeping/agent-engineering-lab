## Why

当前 `agent-cli daemon` 已经具备共享宿主与 attach/reuse 语义，但 daemon 生命周期还不完整：默认启动路径中，HTTP service 一旦开始监听就会返回，daemon 锁会被提前释放，导致 `status`、attach 判定和后续控制面无法可靠反映真实后台进程状态。继续在这个基础上叠加更多入口，会把 daemon 控制面变成“看起来存在，实际上不可信”的薄层。

现在需要把 daemon 从“能启动”推进到“能长期持有、能被关闭、状态可信”。这是后续继续扩展 web console、远端入口或更完整后台管理前必须补齐的基础能力。

## What Changes

- 修正 `agent-cli daemon` 生命周期，使 daemon 锁与后台进程存活期保持一致，而不是在 HTTP service 开始监听后立即释放。
- 增加显式 `agent-cli daemon stop` 控制面，允许本地维护者关闭正在运行的 daemon，并返回明确的成功/失败语义。
- 补强 `daemon status` / lifecycle 相关文档与测试，确保 `running`、`not_running`、`stale` 与 stop 后状态变化可验证。

### In Scope

- daemon 锁持有期修正
- daemon 关闭信号处理与优雅退出
- `agent-cli daemon stop` CLI 子命令
- 对应单测、README 与 OpenSpec 同步

### Out of Scope

- daemon 自启动、自拉起或 supervisor 集成
- 远端 daemon 管理协议
- Web 端 daemon 控制按钮
- scheduler、plugin runtime 或其他非 daemon 生命周期改造

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `agent-host-daemon-runtime`: 增加 daemon 锁持有期、显式 stop 控制与关闭后的状态收敛要求

## Impact

- 影响代码：`apps/agent-cli/src/entrypoints/daemon*.ts`、`apps/agent-cli/src/service-api/server.ts`、`apps/agent-cli/src/entrypoints/cli-dispatcher.ts`
- 影响测试：daemon lifecycle、lock、dispatcher 相关单测
- 影响文档：`apps/agent-cli/README.md`、主规格与归档流程
