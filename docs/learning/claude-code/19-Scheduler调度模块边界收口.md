# Scheduler 调度模块边界收口

## 这次真正学到的东西

### 1. scheduler 不是一个 cron helper，而是一块持久化状态面

`tools/scheduler.ts` 原来同时负责：

- `schedule_*` tool schema
- cron parse / validate / match
- `.schedule/records.json` / `notifications.json` 持久化
- create / list / remove / tick / drain / peek
- now provider 覆写
- public exports

这说明它本质上不是一个简单工具函数，而是“调度语义 + 持久化状态 + 运行时编排”叠在一起的状态面。继续把这些逻辑堆在一个文件里，后续无论是改 cron 语义、改 legacy timestamp 兼容，还是改 duplicate firing guard，都很容易顺手碰到 tool facade。

### 2. scheduler 的自然边界是 types / cron / store / manager / facade

这一轮拆完之后，内部层次更清楚了：

- `scheduler-types.ts`
  - 放 `ScheduleRecord`、`ScheduledPromptNotification`、`TickResult` 和 timestamp normalize helper
- `scheduler-cron.ts`
  - 放 cron parse / validate / match 和 second-level key helper
- `scheduler-store.ts`
  - 负责 `.schedule` 初始化、records / notifications 读写和兼容归一化
- `scheduler-manager.ts`
  - 负责 create / list / remove / tick / drain / peek 和 now provider
- `scheduler.ts`
  - 只保留 tool schema、默认 manager 和兼容导出 facade

这和前几轮 `worktree`、`task-board`、`team` 的内部收口方式已经统一起来了。

## 放到本仓库里怎么看

### 当前已经有的基础

- `scheduled-prompt-runtime` spec 已经定义了 durable schedule、notification drain 和 duplicate firing guard
- `PRD-17` smoke 已经覆盖调度创建、tick、drain 和重启恢复
- runtime coordination service 已经把 scheduler tick 纳入 query preparation 的统一协调入口

### 当前最明显的差距

- `scheduler.ts` 还是一个偏重的大文件
- cron 逻辑和持久化逻辑没有独立 focused tests
- `background-task.ts` 还没有跟上同样的边界拆分节奏

### 这轮只解决哪些差距

- 这轮要做的：拆 scheduler 内部边界，补 focused tests，沉淀文档
- 这轮不做的：不改 cron 语义，不改 durable 行为，不改 notification drain，不顺手重构 `background-task.ts`

## 这轮采纳了什么

### 采纳

- 新增 `scheduler-types.ts`

集中放：

- `ScheduleRecord`
- `ScheduledPromptNotification`
- `TickResult`
- `toTimestampMs`

- 新增 `scheduler-cron.ts`

承接纯逻辑边界：

- `parseCron`
- `isCronValid`
- `cronMatches`
- `secondKey`

- 新增 `scheduler-store.ts`

承接持久化边界：

- `.schedule` 初始化
- `records.json` 读写
- `notifications.json` 读写
- legacy timestamp 兼容归一化

- 新增 `scheduler-manager.ts`

承接运行时编排：

- `createSchedule`
- `listSchedules`
- `removeSchedule`
- `tick`
- `drainNotifications`
- `peekNotificationCount`
- `setSchedulerNowProvider`

- 收窄 `scheduler.ts`

现在 `scheduler.ts` 只保留：

- `SCHEDULER_TOOLS`
- 默认 `SchedulerManager`
- `runSchedule*`
- `tickScheduler`
- `drainScheduledNotifications`
- `peekScheduledNotificationCount`
- 兼容 re-export

- 新增 focused tests

覆盖：

- cron 解析与 second-level match
- legacy ISO timestamp 兼容读取
- notifications 持久化 shape

### 暂不采纳

- 暂不继续拆 runtime coordination

`RuntimeCoordinationService` 现在只是 scheduler 的上层调用者。这轮先把 scheduler 本体拆清，不继续上抬 coordination 形态。

- 暂不顺手重构 `background-task.ts`

它也是明显的状态聚合文件，但和 scheduler 不共享同一套持久化与 cron 语义问题，适合单独起下一轮。

## 这轮实际改成了什么

- `scheduler-types.ts` 承接共享类型与 timestamp helper
- `scheduler-cron.ts` 承接 cron parse / validate / match
- `scheduler-store.ts` 承接 records / notifications 持久化
- `scheduler-manager.ts` 承接 create / list / remove / tick / drain / peek
- `scheduler.ts` 收成 tool schema 与兼容导出 facade
- 新增 `scheduler-cron.test.ts` 与 `scheduler-store.test.ts`

改完之后，后续变更入口更明确：

- 调整 cron 语义，优先改 `scheduler-cron.ts`
- 调整 `.schedule` 兼容与通知持久化，优先改 `scheduler-store.ts`
- 调整 tick、remove 或 drain 行为，优先改 `scheduler-manager.ts`
- 调整 tool schema 或兼容导出，再改 `scheduler.ts`

## 下一步最自然的动作

1. 继续收 `background-task.ts`，它现在是剩下最明显的状态聚合文件之一。
2. 评估 scheduler notification queue 是否长期应提升为更通用的 runtime notification store。
3. 继续检查 `subagent.ts` 或 `scheduler/background` 与 runtime coordination 的下一层边界。
