## Why

`tools/scheduler.ts` 目前把 cron 解析、schedule 持久化、tick 编排、通知队列和 tool facade 聚合在一个文件里。前几轮已经把 worktree、team、task-board 等状态面拆成更清楚的内部边界，scheduler 继续维持单文件聚合，会提高后续调整 cron 语义、持久化兼容和 query runtime 协调时的改动风险。

本轮只拆内部边界，不改变调度行为。

## What Changes

- 新增 scheduler types / timestamp helper 边界。
- 新增 scheduler cron 边界，承接 cron parse / validate / match。
- 新增 scheduler store 边界，承接 records / notifications 的持久化与兼容读取。
- 新增 scheduler manager 边界，承接 create / list / remove / tick / drain / peek 编排。
- 收窄 `tools/scheduler.ts` 为 tool schema、默认 manager 和兼容导出 facade。
- 新增 focused tests 和中文学习沉淀文档。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `production-runtime-architecture`: 增加 scheduler 工具内部需要区分 cron、store、manager 与 tool facade 的边界要求。
- `scheduled-prompt-runtime`: 增加 scheduler 内部边界重构必须保持 cron 语义、持久化和 duplicate firing 语义不变的要求。
- `architecture-learning-knowledge-base`: 要求本轮 scheduler 边界校正同步新增中文学习沉淀文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/tools/scheduler.ts`
  - 新增 scheduler cron / store / manager / types 模块
  - scheduler 单测与 smoke
- 影响文档：
  - 新增 `PRD-32`
  - 新增 OpenSpec change
  - 新增中文学习沉淀文档
- 不改变用户可见的调度工具契约、cron 语义、durable schedule 语义与 query runtime 调度行为。
