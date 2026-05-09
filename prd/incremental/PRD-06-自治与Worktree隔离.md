# PRD-06 自治与 Worktree 隔离

## 目标

让队友具备自治执行能力，并使用 git worktree 实现任务级隔离并行开发。

## 范围（In Scope）

- 自治轮询与任务认领（对应 S11）。
- `EventBus/WorktreeManager` + 任务绑定工作树（对应 S12）。

## 非目标（Out of Scope）

- 新增更复杂的组织层策略（如跨团队调度器）。

## 功能要求

- 空闲轮询参数：
  - `POLL_INTERVAL=5000ms`
  - `IDLE_TIMEOUT=60000ms`
- `scanUnclaimedTasks/claimTask` 支持串行锁保护。
- Worktree 生命周期：创建、状态、运行、保留、删除。
- 事件写入 `.worktrees/events.jsonl`，索引写入 `.worktrees/index.json`。
- 工作树命名校验：`[A-Za-z0-9._-]{1,40}`。
- 非 git 仓库时回退 `WORKDIR` 策略。

## 验收标准（AC）

- AC-06-1：队友可在 idle 阶段自动认领并恢复执行。
- AC-06-2：空闲超时后可安全关停。
- AC-06-3：worktree 全链路工具可用并有事件日志。
- AC-06-4：任务与 worktree 可绑定并形成闭环。

## 实施顺序

1. 先做自治状态机与认领机制。
2. 再做 `WorktreeManager` 与 `EventBus`。
3. 最后打通任务绑定与清理策略。

