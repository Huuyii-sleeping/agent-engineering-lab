# Worktree 工具模块边界收口

## 这次真正学到的东西

### 1. 执行车道要把记录、执行和收尾规则拆开

`tools/worktree.ts` 原来同时负责 worktree record、event log、shell command、git dirty guard、closeout 状态流转和 task sync。这个模块不是简单的工具 facade，而是执行车道状态面。继续混在一个文件里，后续改 dirty guard 或 closeout 规则时，很容易误碰工具 schema 或 task 同步。

这轮把变化原因拆开：

- store 负责 `.worktrees` 文件结构。
- runner 负责命令执行和 git 检测。
- manager 负责 lifecycle 和 task sync 编排。
- facade 负责 tool schema 和 public handlers。

### 2. Worktree 的高风险行为是 dirty guard 和 task sync

Worktree 拆分的风险不在文件变多，而在两个行为漂移：

- dirty worktree 默认不能 remove。
- closeout 后 task 和 worktree 的状态必须一致。

因此本轮 focused tests 盯住了：

- worktree record 兼容读取。
- closeout 归一化。
- command preview 和 name validation。
- create / enter / run / keep / remove。
- `DIRTY_WORKTREE` 输出 shape。
- `runTaskSyncWorktreeState` 调用顺序和参数。

## 放到本仓库里怎么看

### 当前已经有的基础

- `worktree-closeout-runtime` spec 已经定义 lane entry、recent command、closeout 和 dirty guard。
- PRD-18 smoke 已经覆盖 worktree 与 task lifecycle 的端到端路径。
- task-board 已经提供 `runTaskSyncWorktreeState` 作为 task 同步入口。

### 当前最明显的差距

- `tools/worktree.ts` 同时承载 store、runner、manager 和 facade。
- command / git 检测无法独立测试。
- dirty guard 和 closeout 输出主要靠 smoke 兜底，缺少 focused tests。

### 这轮只解决哪些差距

- 这轮要做的：拆 Worktree 内部边界，补 focused tests，沉淀文档。
- 这轮不做的：不改 `.worktrees` 文件格式，不改 dirty guard，不改 closeout，不改 task sync，不改 tool schema。

## 这轮采纳了什么

### 采纳

- 新增 `worktree-types.ts`

集中放共享类型与稳定 helper：

- `WorktreeRecord` / `WorktreeEvent`
- `WORKTREE_SCHEMA_VERSION`
- `previewCommand`
- `validWorktreeName`
- `ok` / `fail` / `dirtyWorktreeFailure`

- 新增 `worktree-store.ts`

承接持久化边界：

- `.worktrees/index.json`
- `.worktrees/events.jsonl`
- record normalize
- closeout normalize

- 新增 `worktree-runner.ts`

承接 I/O runner 边界：

- shell command execution
- git repo 检测
- `.git` metadata 检测
- dirty files 查询

- 新增 `worktree-manager.ts`

承接运行时编排：

- create / list
- enter
- run
- closeout / keep / remove
- task sync

- 收窄 `tools/worktree.ts`

现在 `tools/worktree.ts` 只保留：

- `WORKTREE_TOOLS`
- 默认 `WorktreeManager` 实例
- `runWorktree*` public handlers

### 暂不采纳

- 暂不改变 `exec` 执行实现

本轮只拆边界，不引入 spawn 流式执行、超时或取消机制。

- 暂不改变 dirty guard 规则

dirty git worktree 默认阻止 remove，force 才允许移除。这是现有安全语义，保持不变。

- 暂不迁移 task sync 到 service 层

当前 task-board 仍是工具层状态面，worktree manager 继续调用 `runTaskSyncWorktreeState`。是否迁移为 runtime service 另开 PRD。

## 这轮实际改成了什么

- `worktree-types.ts` 承接类型与 JSON helper。
- `worktree-store.ts` 承接 index / event 持久化与归一化。
- `worktree-runner.ts` 承接 command / git 检测。
- `worktree-manager.ts` 承接 lifecycle 和 closeout 编排。
- `worktree.ts` 收成 tool schema 与 public handler facade。
- focused tests 覆盖 helper、store、manager 和 dirty guard。

改完之后，后续变更入口更明确：

- 调整 `.worktrees` 文件兼容，优先改 `worktree-store.ts`。
- 调整命令执行、git 检测、dirty files，优先改 `worktree-runner.ts`。
- 调整生命周期、closeout、task sync，优先改 `worktree-manager.ts`。
- 调整 tool schema 或 handler，才改 `worktree.ts`。

## 下一步最自然的动作

1. 继续检查 `task-board.ts`，它现在和 Worktree 绑定最深，适合拆 task store / lifecycle / renderer。
2. 评估 worktree command runner 是否需要 timeout、streaming output 和 cancel。
3. 评估 task sync 是否应从工具层函数升级成 runtime service。
