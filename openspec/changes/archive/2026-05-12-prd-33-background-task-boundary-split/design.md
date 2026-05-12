## Context

当前 `tools/background-task.ts` 同时负责：

- `background_run` / `check_background` tool schema
- shell spawn 与 stdout / stderr / exit / error 事件绑定
- in-memory task map 与 notification queue
- 输出截断和 task snapshot
- observability 事件回流
- public exports

这说明后台任务不是一个单纯的 shell helper，而是“异步进程执行 + 状态面 + 通知回流”的组合。要继续稳定扩展异步能力，就需要先把内部边界收清。

## Goals / Non-Goals

**Goals:**

- 拆出 background task types / output helper。
- 拆出 background runner 边界。
- 拆出 background manager 边界。
- 让 `tools/background-task.ts` 退成 facade。
- 保持后台任务行为兼容。

**Non-Goals:**

- 不改变 in-memory 任务生命周期或引入持久化。
- 不改变 `background_run` / `check_background` tool schema 或 JSON 输出 shape。
- 不改变 observability 事件内容与通知回流语义。
- 不顺手重构 `subagent.ts`。

## Decisions

### Decision 1: 新增 `background-task-types.ts`

采纳：

- 集中 `BackgroundStatus`、`BackgroundTask`、`BackgroundNotification`、`cutBackgroundOutput` 和 `taskSnapshot`。

备选方案：

- 继续把类型和 helper 留在 `background-task.ts`。

不采用原因：

- manager 和 tests 都需要共享这些 shape，继续留在 facade 中会延续单文件聚合。

### Decision 2: 新增 `background-task-runner.ts`

采纳：

- runner 负责真正启动子进程，并暴露可测试的进程句柄协议。

备选方案：

- 让 manager 直接依赖 `spawn`。

不采用原因：

- 独立 runner 后，manager 可以用假 runner 做 focused tests，不需要真的起 shell。

### Decision 3: 新增 `background-task-manager.ts`

采纳：

- manager 负责 task map、通知队列、stdout/stderr 聚合、状态流转和 observability 编排。

备选方案：

- 再进一步拆 notification store。

不采用原因：

- 这一轮先做 runner / manager / facade 三层收口，避免过度细分。

## Risks / Trade-offs

- [Risk] exit/error 事件顺序差异引起状态流转偏差 -> Mitigation：用 fake runner 补 completed / failed focused tests。
- [Risk] 输出截断 shape 漂移 -> Mitigation：补 `cut` / snapshot focused tests。
- [Risk] 过度抽象 runner 增加维护成本 -> Mitigation：runner 只承接 spawn，不承接状态逻辑。
