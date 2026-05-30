# PRD-92 Cron 生产级 Lease 与 Explain

## 背景

当前 scheduler 已具备 `schedule_create`、`schedule_list`、`schedule_remove`、one-shot/cron 调度、全局 tick lock、持久化 notification 与运行历史。它已经可用于本地 TUI 主动消费提醒，但仍偏“单进程本地队列”模型：任务自身没有租约字段，排障时也无法直接回答“为什么这个提醒没有触发”。

生产级 cron 还包含重试、补偿、daemon 事件推送、监控告警等能力。本 PRD 先实现最小但关键的一步：让每条 schedule 具备任务级 lease，并提供可被模型和用户调用的 `schedule_explain` 诊断工具，为后续生产化能力打基础。

## 目标

- 为 `ScheduleRecord` 增加任务级 lease 字段：`lease_owner`、`lease_until`。
- scheduler tick 在处理 due schedule 前先 claim 该 schedule 的 lease。
- 未过期且由其他 owner 持有的 schedule 不得重复触发。
- 过期 lease 可被当前 tick 恢复接管。
- 成功生成 notification 并更新 schedule 后清理 lease。
- 新增 `schedule_explain` 工具，返回 schedule 当前状态、due 判断、lease 状态、近期历史与可读原因。
- 兼容历史 records，缺失 lease 字段时迁移为 `null`。

## 非目标

- 不实现 daemon 常驻推送或跨终端实时事件总线。
- 不实现 retry/backoff 策略。
- 不实现 misfire 补偿策略。
- 不改变现有 cron 表达式语义。
- 不引入外部数据库、消息队列或新依赖。

## 验收标准

- legacy schedule 读取后包含 `lease_owner: null` 与 `lease_until: null`。
- due schedule 若被其他 owner 的未过期 lease 占用，tick 不生成 notification。
- due schedule 若 lease 已过期，tick 可接管并正常触发。
- 成功触发后 schedule lease 被清理。
- `schedule_explain` 对不存在 schedule 返回明确错误。
- `schedule_explain` 对 active lease 返回可读原因，说明当前为什么不会触发。
- `pnpm --dir apps/agent-cli test`、`pnpm build`、OpenSpec status/validate 通过。
