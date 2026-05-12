## Context

当前 `tools/worktree.ts` 的职责包括：

- worktree tool schemas
- worktree index 初始化、读取、归一化和保存
- event jsonl 写入
- shell command 执行
- git repo 和 dirty files 检测
- create / enter / run / closeout / keep / remove 流程
- task worktree state 同步
- public run handlers

Worktree 是执行车道、任务状态和安全回收的交汇点，后续很可能继续扩展隔离策略、恢复策略和 closeout 保护。因此需要先把内部边界拆清楚。

## Goals / Non-Goals

**Goals:**

- 拆出 worktree store 边界。
- 拆出 worktree runner 边界。
- 拆出 worktree manager 边界。
- 让 `tools/worktree.ts` 只做 tool schema 与 public handler facade。
- 保持 worktree 行为兼容。

**Non-Goals:**

- 不改变 worktree schemaVersion。
- 不改变 index / events 文件格式。
- 不改变 dirty guard、force remove、closeout 或 task sync 语义。
- 不改变 `worktree_*` public handler 导出。

## Decisions

### Decision 1: 新增 `worktree-types.ts`

采纳：

- 集中 WorktreeStatus、CloseoutAction、WorktreeRecord、WorktreeEvent 等类型。
- 集中 `ok`、`fail`、`dirtyWorktreeFailure`、`previewCommand`、`validWorktreeName` 和 event id 生成。

备选方案：

- 每个模块各自定义类型和 helper。

不采用原因：

- store、runner、manager 和 facade 都需要共享这些 shape；分散定义容易导致输出漂移。

### Decision 2: 新增 `worktree-store.ts`

采纳：

- store 负责 `.worktrees/index.json` 与 `.worktrees/events.jsonl` 的初始化、load/save/append。
- record 归一化与 closeout 归一化放在 store 边界。

备选方案：

- 让 store 直接执行 create/enter/run 状态流转。

不采用原因：

- 状态流转需要 command runner、task sync 和 closeout guard 参与，属于 manager 编排职责。

### Decision 3: 新增 `worktree-runner.ts`

采纳：

- runner 负责 shell command 执行、git repo 检测、git metadata 检测和 dirty files 查询。
- runner 不处理 worktree record 状态变更。

备选方案：

- 将 command exec 留在 manager。

不采用原因：

- command / git 检测是 I/O runner 边界，独立后更容易单测和替换。

### Decision 4: 新增 `WorktreeManager`

采纳：

- manager 负责 create、enter、run、closeout、keep、remove 流程编排。
- manager 持有 store 与 runner，并继续调用 `runTaskSyncWorktreeState`。
- `tools/worktree.ts` 持有默认 manager 并导出 public handlers。

备选方案：

- 保留 `WorktreeManager` 在 `tools/worktree.ts`。

不采用原因：

- `tools/worktree.ts` 应与其他工具 facade 一样，只表达工具 schema 和对外函数。

## Risks / Trade-offs

- [Risk] record 兼容读取时字段默认值变化 → Mitigation：focused tests 覆盖归一化。
- [Risk] dirty guard 输出 shape 改变 → Mitigation：focused tests 覆盖 `DIRTY_WORKTREE`。
- [Risk] task sync 调用顺序变化 → Mitigation：保留原 manager 编排顺序，并跑 PRD-18 smoke。
