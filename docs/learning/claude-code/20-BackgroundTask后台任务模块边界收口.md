# BackgroundTask 后台任务模块边界收口

## 这次真正学到的东西

### 1. background-task 不是 shell helper，而是异步执行状态面

`tools/background-task.ts` 原来同时负责：

- `background_run` / `check_background` tool schema
- 子进程 `spawn`
- task map
- notification queue
- stdout / stderr 聚合
- 输出截断
- observability 事件回流

这说明它本质上不是一个简单的命令执行工具，而是“异步进程执行 + 状态流转 + 通知回流”叠在一起的状态面。继续堆在一个文件里，后续只要改一点进程启动、事件监听或通知 shape，就很容易碰到 facade。

### 2. 这块最自然的边界是 types / runner / manager / facade

这一轮拆完之后，内部层次更清楚了：

- `background-task-types.ts`
  - 放 `BackgroundTask`、`BackgroundNotification`、输出截断和 snapshot helper
- `background-task-runner.ts`
  - 放默认的 `spawn` runner 和可测试的进程句柄协议
- `background-task-manager.ts`
  - 放 task map、通知队列、stdout/stderr 聚合、状态流转和 observability 编排
- `background-task.ts`
  - 只保留 tool schema、默认 manager 和兼容导出 facade

这样后续如果要改 runner，不会顺手碰到 manager；如果要改通知和状态流转，也不用再穿过 `spawn` 细节。

## 放到本仓库里怎么看

### 当前已经有的基础

- `background-task-runtime` spec 已经定义了异步启动、状态查询和通知回流语义
- query notification service 已经会把 background notifications 注入到主循环
- runtime observability 已经承接 `background_task` 事件

### 当前最明显的差距

- `background-task.ts` 仍然是状态面和 runner 逻辑混写
- 没有 focused tests 钉住 completed / failed 状态流转
- 真实 shell spawn 让测试边界不够清楚

### 这轮只解决哪些差距

- 这轮要做的：拆 `BackgroundTask` 内部边界，补 focused tests，沉淀文档
- 这轮不做的：不引入持久化，不改通知语义，不顺手重构 `subagent.ts`

## 这轮采纳了什么

### 采纳

- 新增 `background-task-types.ts`

集中放：

- `BackgroundStatus`
- `BackgroundTask`
- `BackgroundNotification`
- `cutBackgroundOutput`
- `taskSnapshot`

- 新增 `background-task-runner.ts`

承接 runner 边界：

- 默认 `spawn` 实现
- `BackgroundProcessLike`
- `BackgroundStreamLike`
- `BackgroundTaskRunnerLike`

- 新增 `background-task-manager.ts`

承接运行时编排：

- `run`
- `check`
- `drainNotifications`
- stdout / stderr 聚合
- completed / failed 状态流转
- observability 编排

- 收窄 `background-task.ts`

现在 `background-task.ts` 只保留：

- `BACKGROUND_TOOLS`
- 默认 `BackgroundManager`
- `runBackgroundRun`
- `runCheckBackground`
- `drainBackgroundNotifications`

- 新增 focused tests

覆盖：

- 输出截断与 snapshot shape
- completed 状态与 drain
- failed 状态与查询输出

### 暂不采纳

- 暂不引入持久化

当前后台任务依然是会话内 in-memory 状态面。要不要跨重启恢复，这是一个单独的能力问题，不该在这轮边界收口里顺手塞进去。

- 暂不顺手重构 `subagent.ts`

它也是明显的大模块，但和后台任务不是同一类执行面，适合单独开下一轮。

## 这轮实际改成了什么

- `background-task-types.ts` 承接共享类型与输出 helper
- `background-task-runner.ts` 承接默认 `spawn` runner
- `background-task-manager.ts` 承接状态流转、通知队列与 observability 编排
- `background-task.ts` 收成 tool schema 与兼容导出 facade
- 新增 `background-task-types.test.ts` 与 `background-task-manager.test.ts`

改完之后，后续变更入口更明确：

- 调整后台进程启动协议，优先改 `background-task-runner.ts`
- 调整状态流转、通知 drain 或 observability，优先改 `background-task-manager.ts`
- 调整 tool schema 或对外导出，再改 `background-task.ts`

## 下一步最自然的动作

1. 继续看 `subagent.ts`，它现在是 tools 层剩下最重的大文件之一。
2. 评估后台任务是否长期需要 durable persistence。
3. 检查 `background`、`scheduler`、`subagent` 这几块通知源是否还需要更统一的 notification store。
