# Proposal

## Why

当前 scheduler 已能生成 scheduled prompt，但模型仍是“cron 命中后写入通知队列”。用户请求“1s 后提醒我喝水”时，模型容易把一次性提醒误建成 `*/1 * * * * *` 的循环任务；同时缺少运行历史、下一次运行、最近错误和跨进程 tick 锁，导致排查主动提醒问题时只能从 TUI 输出猜测。

Claude Code 源码结构中 cron 能力拆成 tool、scheduler、task store、task lock 和 UI hook。这里不复制外部源码，但采用同样的职责分层：工具层表达契约，manager 负责生命周期和去重，store 负责持久化，lock 避免重复 tick，TUI/CLI 通过 list 能看到任务状态。

## What Changes

- 扩展 schedule record 生命周期字段：`kind`、`status`、`next_run_at`、`last_run_at`、`last_error`、`run_count`。
- `schedule_create` 支持 `delay_ms` 和 `once_at`，用于明确的一次性提醒。
- 新增 scheduler run history，记录每次 fired 的任务、时间和状态。
- 新增本地 scheduler tick lock，避免多个进程同时触发相同调度。
- `schedule_list` 返回任务生命周期字段和近期 history。
- 保持既有 cron 表达式、notification drain 和 durable 恢复兼容。

## Impact

- 影响代码：`apps/agent-cli/src/tools/scheduler-*`、`tools/base.ts`、运行时配置。
- 影响测试：scheduler manager/store/cron/tool facade 单元测试和 PRD smoke。
- 影响规范：`scheduled-prompt-runtime` 增加 cron task lifecycle 要求。
