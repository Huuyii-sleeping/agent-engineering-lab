# PRD-17 定时调度与未来任务注入

## 目标

让 Agent 能记住“未来什么时候开始做一件事”，并在到点时把它重新送回主循环。

## 范围（In Scope）

- `ScheduleRecord` 持久化。
- 分钟级 cron / schedule 检查器。
- 调度通知队列。
- 主循环对 `scheduled_prompt` 的统一注入。

## 非目标（Out of Scope）

- 毫秒级精确调度。
- 完整企业级 job orchestration。

## 功能要求

- 调度记录至少包含：
  - `id`
  - `cron`
  - `prompt`
  - `recurring`
  - `durable`
  - `created_at`
  - `last_fired_at`
- 检查器按分钟扫描是否命中。
- 命中后不是直接后台执行，而是先进入通知队列。
- 主循环下一轮把调度触发作为新的用户意图注入。
- 持久化调度在进程重启后可恢复。

## 验收标准（AC）

- AC-17-1：可创建一条未来调度记录并成功落盘。
- AC-17-2：命中后会生成 `scheduled_prompt` 通知，而不是静默执行。
- AC-17-3：同一调度不会在短时间内重复连发。
- AC-17-4：程序重启后 durable 调度仍可继续生效。

## 实施顺序

1. 先做 `ScheduleRecord` 与持久化。
2. 再做分钟级检查器与通知队列。
3. 最后接入主循环注入与恢复验证。
