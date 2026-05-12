## Why

`tools/worktree.ts` 同时包含 worktree record 类型、index/event store、shell command runner、git dirty guard、closeout 状态流转、task 同步和 public handlers。继续聚合在一个文件里，会让后续调整执行车道或 closeout 保护时更容易误碰工具对外契约。

本轮只拆内部边界，不改变 worktree 行为。

## What Changes

- 新增 worktree 类型与 JSON 输出工具边界。
- 新增 worktree store 模块，承接 index / events 持久化与记录归一化。
- 新增 worktree runner 模块，承接 command exec、git repo 检测和 dirty files 检测。
- 新增 worktree manager 模块，承接 create、enter、run、closeout 与 task sync 编排。
- 更新 `tools/worktree.ts` 为 tool schema 与 handler facade。
- 新增学习沉淀文档。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加 worktree 工具内部必须区分 store、runner、manager 与 tool facade 的要求。
- `worktree-closeout-runtime`: 明确本轮边界收口必须保持 closeout、dirty guard 与 task sync 语义不变。
- `architecture-learning-knowledge-base`: 继续要求本轮边界校正沉淀中文学习文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/tools/worktree-types.ts`
  - `apps/agent-cli/src/tools/worktree-store.ts`
  - `apps/agent-cli/src/tools/worktree-runner.ts`
  - `apps/agent-cli/src/tools/worktree-manager.ts`
  - `apps/agent-cli/src/tools/worktree.ts`
  - focused worktree tests
- 影响文档：
  - 新增 `PRD-30`
  - 新增 OpenSpec change
  - 新增学习沉淀文档
- 不改变用户可见 CLI、工具 schema、输出结构、dirty guard、closeout 或 task sync 行为。
