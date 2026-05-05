## Why

PRD-05 已具备团队通信与协议能力，但队友仍缺少自治认领与隔离执行环境，难以稳定并行推进任务。PRD-06 需要补齐自治轮询、任务认领锁和 worktree 生命周期管理，形成任务到执行环境的闭环。

## What Changes

- 新增自治认领机制：空闲轮询、未认领任务扫描、串行锁保护认领。
- 新增 `WorktreeManager`：创建/查询/运行/保留/删除工作树。
- 新增 `EventBus`：写入 `.worktrees/events.jsonl` 与 `.worktrees/index.json`。
- 新增任务与 worktree 绑定能力，支持闭环跟踪与清理。

## In Scope

- `POLL_INTERVAL=5000ms`、`IDLE_TIMEOUT=60000ms` 配置生效。
- `scanUnclaimedTasks/claimTask` 串行锁。
- worktree 名称校验 `[A-Za-z0-9._-]{1,40}`。
- 非 git 仓库回退 `WORKDIR` 策略。

## Out of Scope

- 跨团队全局调度器。
- 复杂资源配额与抢占策略。

## Capabilities

### New Capabilities
- `autonomy-worktree-isolation`: 自治认领 + worktree 隔离执行 + 事件追踪。

### Modified Capabilities
- `task-visualization-persistence`: 新增任务与 worktree 绑定字段。
- `core-agent-loop`: 新增自治轮询入口。

## Impact

- 影响代码：任务模块、主循环、工作树工具模块。
- 影响数据：新增 `.worktrees` 目录与事件索引文件。
- 影响运行：支持并行隔离执行与可观测生命周期管理。
