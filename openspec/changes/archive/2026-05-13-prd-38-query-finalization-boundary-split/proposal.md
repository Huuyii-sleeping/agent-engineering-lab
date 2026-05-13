## Why

`runtime/query-finalization.ts` 是 query runtime 的收尾阶段，但当前同时包含轮次计数、auto delivery、Stop hook 和 system message 注入。继续聚合会让后续调整停止原因、交付验证摘要或 hook 行为时误碰收尾契约。

本轮只拆内部边界，不改变 finalization public API、auto delivery、round counter 或 Stop hook 语义。

## What Changes

- 新增 query finalization types 边界。
- 新增 query finalization round counter 模块，承接 assistant-only 与 tool-driven 轮次计数更新。
- 新增 query finalization delivery 模块，承接 auto delivery 触发与摘要生成。
- 新增 query finalization stop 模块，承接 Stop hook 调用与 system message 注入。
- 更新 `query-finalization.ts` 为 public facade。
- 新增 focused tests 与中文学习沉淀文档。
- 更新 AGENT，沉淀“收口操作由 Agent 自行推进”的协作规则。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加 QueryFinalization 内部必须区分 round counter、delivery finalizer、stop hook 与 public facade 的要求。
- `core-agent-loop`: 明确边界收口必须保持收尾 stopReason、round counter 与 Stop hook 语义不变。
- `delivery-quality-validation`: 明确边界收口必须保持 auto delivery 触发、changedPaths 和摘要文案语义不变。
- `hook-extension-points`: 明确边界收口必须保持 Stop hook payload 与 system message 注入语义不变。
- `architecture-learning-knowledge-base`: 继续要求本轮边界校正沉淀中文学习文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/runtime/query-finalization-types.ts`
  - `apps/agent-cli/src/runtime/query-finalization-rounds.ts`
  - `apps/agent-cli/src/runtime/query-finalization-delivery.ts`
  - `apps/agent-cli/src/runtime/query-finalization-stop.ts`
  - `apps/agent-cli/src/runtime/query-finalization.ts`
  - focused query finalization tests
- 影响文档：
  - 新增 `PRD-38`
  - 新增 OpenSpec change
  - 新增学习沉淀文档
  - 更新 `AGENT.md`
- 不改变 finalization public API、auto delivery、round counter、Stop hook 或 system message 注入语义。
