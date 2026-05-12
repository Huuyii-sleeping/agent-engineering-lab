## Why

`tools/background-task.ts` 现在把 shell spawn、任务状态、通知队列、输出裁剪和 observability 编排混在一个文件里。随着 `task-board`、`scheduler` 等状态面已经完成内部收口，后台任务这块继续维持单文件聚合，会提高后续调整异步执行策略、通知回流和输出约束时的改动风险。

本轮只拆内部边界，不改变后台任务行为。

## What Changes

- 新增 background task types / output helper 边界。
- 新增 background runner 边界，承接子进程启动。
- 新增 background manager 边界，承接任务状态、通知队列和 observability 编排。
- 收窄 `tools/background-task.ts` 为 tool schema、默认 manager 与兼容导出 facade。
- 新增 focused tests 和中文学习沉淀文档。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `production-runtime-architecture`: 增加 background task 工具内部需要区分 runner、manager 与 tool facade 的边界要求。
- `background-task-runtime`: 增加后台任务内部边界重构必须保持异步执行、通知回流和 observability 语义不变的要求。
- `architecture-learning-knowledge-base`: 要求本轮 background-task 边界校正同步新增中文学习沉淀文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/tools/background-task.ts`
  - 新增 background task runner / manager / types 模块
  - background task focused tests
- 影响文档：
  - 新增 `PRD-33`
  - 新增 OpenSpec change
  - 新增中文学习沉淀文档
- 不改变用户可见的后台任务工具契约、通知回流与 observability 事件语义。
