# PRD-31 TaskBoard 任务模块边界收口

## 背景

`apps/agent-cli/src/tools/task-board.ts` 当前同时承载 task tool schema、任务持久化、状态迁移、claim 流程、worktree 同步和 public handlers。随着 `worktree`、`team`、`security` 等模块已经完成 store / manager / facade 的边界收口，`task-board` 成为下一块仍然明显偏重的状态聚合点。

## 目标

- 拆出 task types / JSON helper。
- 拆出 task store，承接 `.tasks/task_*.json` 的持久化、兼容读取与依赖清理。
- 拆出 task manager，承接 create / get / list / update / claim / worktree sync 流程编排。
- 收窄 `tools/task-board.ts` 为 tool schema 与 public handler facade。
- 补 focused tests 与中文学习沉淀文档。

## 非目标

- 不改变 `task_*` tool schema、handler 导出、错误码或 JSON 输出 shape。
- 不改变任务状态机语义、claim 语义或 worktree 同步语义。
- 不把 task 能力迁移到 `services/`。
- 不改 autonomy、worktree 或 todo 的对外功能。

## 验收标准

1. `tools/task-board.ts` 不再直接承载持久化、claim 和 worktree sync 细节。
2. focused tests 覆盖：
   - task 兼容读取与 schema version 归一化
   - 状态迁移与依赖清理
   - unclaimed scan 与 claim 语义
   - worktree state / closeout 同步
3. 原有 PRD-13 与 PRD-18 smoke 行为保持通过。
4. `pnpm --filter agent-cli build` 通过。
5. `openspec validate --all --strict` 通过。
6. 新增学习沉淀文档记录本轮采纳与暂不采纳内容。
