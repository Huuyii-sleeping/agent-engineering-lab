## Why

`tools/task-board.ts` 目前同时聚合任务 schema、磁盘持久化、状态机、claim 流程、worktree 同步和 public handlers，已经成为 tools 层剩余最明显的大文件之一。前几轮已经把 worktree、team、security 等模块收成更清楚的 store / manager / facade 边界，这一轮继续收口 task-board，可以降低后续调整 task lifecycle、autonomy claim 和 worktree 联动时的改动面。

本轮只拆内部边界，不改变任务行为。

## What Changes

- 新增 task types / JSON helper 边界。
- 新增 task store 边界，承接任务读写、兼容归一化和依赖清理。
- 新增 task manager 边界，承接 create / get / list / update / scan / claim / worktree sync 编排。
- 收窄 `tools/task-board.ts` 为 tool schema 与 public handler facade。
- 新增 focused tests 和中文学习沉淀文档。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `production-runtime-architecture`: 增加 task 工具内部需要区分 store、manager 与 tool facade 的边界要求。
- `task-visualization-persistence`: 增加 task 持久化与状态机内部边界的维护要求，同时保持现有状态迁移与 worktree 绑定语义不变。
- `autonomy-worktree-isolation`: 明确 task claim 与 worktree 同步在边界收口后仍保持原有语义，并可由独立 manager 承接。
- `architecture-learning-knowledge-base`: 要求本轮 task-board 边界校正同步新增中文学习沉淀文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/tools/task-board.ts`
  - 新增 task types / store / manager 模块
  - `apps/agent-cli/src/tools/autonomy.ts`
  - `apps/agent-cli/src/tools/worktree-manager.ts`
  - focused task / worktree tests
- 影响文档：
  - 新增 `PRD-31`
  - 新增 OpenSpec change
  - 新增中文学习沉淀文档
- 不改变用户可见的 CLI、tool schema、任务状态机、claim 与 worktree 同步行为。

