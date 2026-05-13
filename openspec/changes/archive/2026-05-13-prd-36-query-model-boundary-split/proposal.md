## Why

`runtime/query-model.ts` 是主循环模型请求的核心链路，但当前同时包含 request message 构造、token preflight、model policy、fallback、response recovery、transport recovery 和 observability。继续聚合会让后续调整模型策略或恢复策略时容易误碰 `requestQueryModel` 的 public 契约。

本轮只拆内部边界，不改变模型请求、fallback、compact、recovery 或 stopReason 行为。

## What Changes

- 新增 query model types / helper 边界。
- 新增 query model request 模块，承接 request message 构造、文本摘要、OpenAI request 调用和 response 归一化。
- 新增 query model recovery 模块，承接 recovery failure 记录、preflight compact 与 recovery 公共动作。
- 新增 query model fallback 模块，承接 fallback model selection、retry request 和 usage finalize。
- 更新 `query-model.ts` 为 public orchestration facade。
- 新增 focused tests 与中文学习沉淀文档。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加 QueryModel 内部必须区分 request、fallback、recovery 与 public orchestration 的要求。
- `model-policy-budget-fallback`: 明确边界收口必须保持 model selection、budget deny、fallback once 与 usage finalize 语义不变。
- `error-recovery-retries`: 明确边界收口必须保持 preflight compact、response continuation、transport backoff 和 recovery failure 语义不变。
- `architecture-learning-knowledge-base`: 继续要求本轮边界校正沉淀中文学习文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/runtime/query-model-types.ts`
  - `apps/agent-cli/src/runtime/query-model-request.ts`
  - `apps/agent-cli/src/runtime/query-model-recovery.ts`
  - `apps/agent-cli/src/runtime/query-model-fallback.ts`
  - `apps/agent-cli/src/runtime/query-model.ts`
  - focused query model tests
- 影响文档：
  - 新增 `PRD-36`
  - 新增 OpenSpec change
  - 新增学习沉淀文档
- 不改变 `requestQueryModel` public API、模型请求输出、fallback、compact、recovery 或 stopReason。
