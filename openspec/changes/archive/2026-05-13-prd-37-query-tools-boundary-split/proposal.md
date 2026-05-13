## Why

`runtime/query-tools.ts` 是 query runtime 的工具执行阶段，但当前同时包含 hook 阻断、工具执行、观测、结果分析、写副作用和 task/todo 同步。继续聚合会让后续调整 hook、工具观测或任务联动时容易误碰工具回填契约。

本轮只拆内部边界，不改变工具执行顺序、hook 语义、tool result message shape 或 task/todo 同步行为。

## What Changes

- 新增 query tool types / shared helper 边界。
- 新增 query tool hooks 模块，承接 hook blocked output 与 Pre/Post hook 调用。
- 新增 query tool executor 模块，承接单次工具调用执行、观测、结果分析和 tool message 回填。
- 新增 query tool task sync 模块，承接 todo 自动完成与 active task 同步。
- 更新 `query-tools.ts` 为 tool stage orchestration。
- 新增 focused tests 与中文学习沉淀文档。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加 QueryToolStage 内部必须区分 hooks、executor、task sync 与 stage orchestration 的要求。
- `core-agent-loop`: 明确边界收口必须保持工具调用顺序、tool result 回填、写副作用和 task/todo 同步语义不变。
- `hook-extension-points`: 明确边界收口必须保持 PreToolUse / PostToolUse hook 阻断、注入消息和结构化输出语义不变。
- `architecture-learning-knowledge-base`: 继续要求本轮边界校正沉淀中文学习文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/runtime/query-tool-types.ts`
  - `apps/agent-cli/src/runtime/query-tool-hooks.ts`
  - `apps/agent-cli/src/runtime/query-tool-executor.ts`
  - `apps/agent-cli/src/runtime/query-tool-task-sync.ts`
  - `apps/agent-cli/src/runtime/query-tools.ts`
  - focused query tool tests
- 影响文档：
  - 新增 `PRD-37`
  - 新增 OpenSpec change
  - 新增学习沉淀文档
- 不改变 `runQueryToolStage` public API、工具调用顺序、hook、tool result、security event 或 task/todo 同步语义。
