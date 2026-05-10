## Why

当前 worktree 能力已经支持创建、运行、保留和移除，但仍停留在“会建目录、会跑命令”的基础阶段。随着 PRD-16/17 已补齐恢复与调度能力，后续并行开发更需要明确“任务在哪个执行车道推进、最近做了什么、结束时如何收尾”，否则 worktree 很容易变成难追踪、难回收、易误删的临时目录。

## What Changes

- 为任务记录补充 `worktree_state`、`last_worktree` 与 `closeout` 元数据，区分“任务状态”和“执行车道状态”。
- 为 worktree 记录补充 `last_entered_at`、`last_command_at`、`last_command_preview` 与 `closeout` 信息，保留最近进入与执行痕迹。
- 新增 `worktree_enter(...)`，将“进入车道”与“执行命令”从 `worktree_run(...)` 中拆开。
- 新增统一的 `worktree_closeout(...)`，收敛 `keep` / `remove` 的收尾决策、任务同步与事件记录。
- 在移除 worktree 前增加脏改动检查，默认阻止误删未提交工作，并提供明确的保留或确认语义。

## Capabilities

### New Capabilities
- `worktree-closeout-runtime`: 定义 worktree 进入、收尾与脏改动保护的统一运行时契约。

### Modified Capabilities
- `autonomy-worktree-isolation`: 扩展任务与 worktree 绑定后的状态表达，补充最近车道、进入时间和收尾一致性要求。

## Impact

- 影响 `apps/agent-cli/src/tools/worktree.ts`、`apps/agent-cli/src/tools/task-board.ts`、`apps/agent-cli/src/tools/autonomy.ts` 等 worktree/task 运行时模块。
- 影响 worktree 与 task 的持久化数据结构、生命周期事件日志以及相关 smoke / regression 测试。
- 不引入外部依赖，不改变既有 `task_*` / `worktree_*` 基础能力的核心调用方式，但会新增更明确的 closeout 与 enter 接口。
