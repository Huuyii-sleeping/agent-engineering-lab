## Context

旧 readline CLI 在交互循环旁维护 `setInterval -> runScheduledRound`，因此 due scheduled prompt 会主动触发模型处理并输出。Ink/TSX CLI 只处理用户提交输入，缺少后台 tick，因此提醒任务不会主动推送到界面。

## Decisions

### Decision 1: 在 Ink runtime controller 中集中调度

选择：新增 `createInkRuntimeController()`，同时负责 `submit()` 和 `runScheduledTick()`。

理由：active session、workflow、busy 状态需要在用户提交和后台提醒之间共享，放在同一个 controller 中可以避免两个状态源竞争。

### Decision 2: Embedded 复用 `runScheduledRound`

选择：embedded runtime 有完整 `AgentAppRuntimeDeps` 时直接调用现有 `runScheduledRound()`。

理由：旧 CLI 的 scheduled round 已覆盖 tick、peek、queryEngine 执行和错误输出，复用它能保持语义一致。

### Decision 3: Daemon-backed service 使用 `service.chat()`

选择：无本地 app 依赖时，本地 tick scheduler 并 peek due count，再向 daemon service 发送 `Handle any scheduled prompts that are due now.`。

理由：daemon service 封装了远端 runtime，Ink 进程不能直接访问远端 `queryEngine`，但 `chat()` 会走远端查询准备和 notification drain。

## Risks

- [Risk] scheduler tick 与用户提交同时发生。Mitigation：controller 共享 `agentBusy`，busy 时跳过或返回忙碌提示。
- [Risk] 非 TTY smoke 被后台 interval 干扰。Mitigation：只有 interactive TTY 模式启用 scheduled tick。
