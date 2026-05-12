## Context

当前 `tools/scheduler.ts` 同时负责：

- `schedule_*` tool schema
- cron 解析、校验和匹配
- `.schedule/records.json` / `notifications.json` 初始化、读取和保存
- create / list / remove / tick / drain / peek 编排
- 当前时间 provider 覆写
- public exports

这让 cron 语义、持久化兼容和 tick 编排全都绑在同一个文件里。考虑到 scheduler 已经是 query runtime preparation 与 CLI 轮询都会接入的状态面，这一轮需要先把内部边界收清，再继续向后推进其他调度相关模块。

## Goals / Non-Goals

**Goals:**

- 拆出 scheduler types / timestamp helper。
- 拆出 scheduler cron 解析与匹配边界。
- 拆出 scheduler store 边界。
- 拆出 scheduler manager 边界。
- 让 `tools/scheduler.ts` 只保留 facade 与兼容导出。
- 保持现有调度行为兼容。

**Non-Goals:**

- 不改变 cron 字段语义、5-field 默认 second=0 规则或 duplicate firing guard。
- 不改变 `.schedule` 文件格式。
- 不改变 `schedule_*` tool schema、JSON 输出 shape 或 runtime coordination service 的调用方式。
- 不顺手重构 `background-task.ts`。

## Decisions

### Decision 1: 新增 `scheduler-types.ts`

采纳：

- 集中 `ScheduleRecord`、`ScheduledPromptNotification`、`TickResult` 与 timestamp normalize helper。

备选方案：

- 继续把类型和 helper 留在 `scheduler.ts`。

不采用原因：

- store、manager 和 facade 都依赖这些 shape，继续散落会延续单文件聚合。

### Decision 2: 新增 `scheduler-cron.ts`

采纳：

- 集中 `parseCron`、`isCronValid`、`cronMatches` 和 minute/second key helper。

备选方案：

- 把 cron 逻辑继续和 scheduler manager 放在一起。

不采用原因：

- cron 解析是稳定的纯逻辑边界，独立后更利于 focused tests 和后续校验。

### Decision 3: 新增 `scheduler-store.ts`

采纳：

- store 负责 `.schedule` 初始化、records / notifications 读写和兼容归一化。

备选方案：

- 让 manager 直接读写文件。

不采用原因：

- 持久化与兼容读取是明显的 store 职责，和 tick 编排拆开更清楚。

### Decision 4: 新增 `scheduler-manager.ts`

采纳：

- manager 负责 create / list / remove / tick / drain / peek，并持有 store。
- `setSchedulerNowProvider` 与默认 manager 一并通过 facade 暴露兼容出口。

备选方案：

- 进一步拆 tick runner 与 notification queue manager。

不采用原因：

- 这一轮先做一层 manager 收口，避免过度细分。

## Risks / Trade-offs

- [Risk] legacy ISO timestamp 兼容读取回归 -> Mitigation：补 store focused tests 与既有 scheduler test。
- [Risk] cron 解析或 match 语义漂移 -> Mitigation：补 cron focused tests，保留 `PRD-17` smoke。
- [Risk] duplicate firing guard 或 one-shot disable 顺序变化 -> Mitigation：继续覆盖 tick 行为测试。
