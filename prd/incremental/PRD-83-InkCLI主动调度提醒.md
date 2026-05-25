# PRD-83 Ink CLI 主动调度提醒

## 背景

默认 CLI 切换到 Ink/TSX surface 后，用户可以通过 `schedule_create` 创建提醒任务，但 Ink 入口没有旧 readline CLI 中的 scheduler loop。结果是任务创建成功后只进入调度队列，除非后续用户再次发起请求，否则提醒不会主动显示。

## 目标

- Ink/TSX CLI 在 TTY 模式下定时 tick scheduler。
- 有 due scheduled prompt 时，主动驱动当前 runtime 或 daemon-backed service 处理提醒。
- 将 scheduled due 和 assistant 回复追加到当前 Ink 消息流。
- 保持非 TTY smoke 行为不变。

## 非目标

- 不重写 scheduler 存储或 cron 解析。
- 不新增独立桌面/系统级通知。

## 验收标准

- 单元测试覆盖 embedded runtime 的 due scheduled prompt 处理。
- 单元测试覆盖 daemon-backed service 的 due scheduled prompt 处理。
- Ink TUI smoke 和构建通过。
