## Context

当前 `runtime/query-model.ts` 的职责包括：

- prompt envelope 组装
- request messages 构造
- token estimate 与 preflight compact
- model policy selection 与 budget deny
- OpenAI chat completion request
- usage finalize
- fallbackable error 判断后的 fallback model retry
- response recovery：length continuation
- error recovery：compact、backoff、fail
- model request / response / recovery / policy observability
- public `requestQueryModel` 编排

QueryModel 是主循环最关键的模型请求边界，后续很可能继续扩展多角色模型策略、恢复预算、请求参数和观测字段。因此需要先把内部边界拆清楚。

## Goals / Non-Goals

**Goals:**

- 拆出 query model request 边界。
- 拆出 query model fallback 边界。
- 拆出 query model recovery 边界。
- 让 `query-model.ts` 只做 public orchestration。
- 保持模型请求行为兼容。

**Non-Goals:**

- 不改变 prompt envelope 或 request messages 顺序。
- 不改变 `max_tokens`、tools 传递或 OpenAI request shape。
- 不改变 model policy selection、budget deny、fallback once 或 usage finalize 语义。
- 不改变 recovery selector、compact、continuation、backoff 或 failure message 语义。
- 不改变 `requestQueryModel` public API。

## Decisions

### Decision 1: 新增 `query-model-types.ts`

采纳：

- 集中 `QueryModelResult`、`RequestQueryModelOptions`、`QueryModelRequestContext`、`QueryModelCompletionResult` 等共享类型。
- 保持 `QueryModelResult` 和 `RequestQueryModelOptions` 可由 facade re-export 或内部复用。

备选方案：

- 类型继续留在 `query-model.ts`。

不采用原因：

- request、fallback、recovery 都要共享同一组选项和响应归一化类型；继续留在 facade 会让 facade 继续承担内部协议定义。

### Decision 2: 新增 `query-model-request.ts`

采纳：

- request 模块负责 `summarizeText`、request messages 构造、主模型 request 调用和 response 归一化。
- request 模块不负责选择模型、fallback 或 recovery 决策。

备选方案：

- 在 facade 中继续直接调用 OpenAI client。

不采用原因：

- 请求构造与 response 归一化是稳定协议边界，独立后更容易测试 request shape 与 observability 输入。

### Decision 3: 新增 `query-model-fallback.ts`

采纳：

- fallback 模块负责 fallback selection、fallback request、fallback usage finalize 和 fallback selection observability。
- fallback 只返回 fallback 成功的 message；失败或空响应返回 null，由 facade 继续进入 recovery selector。

备选方案：

- 把 fallback 归入 recovery 模块。

不采用原因：

- fallback 属于 model policy / request retry 边界，不是 recovery selector 的动作；独立后更贴近 `model-policy-budget-fallback` spec。

### Decision 4: 新增 `query-model-recovery.ts`

采纳：

- recovery 模块负责 append recovery failure、record recovery decision、preflight compact 和 recovery 控制台日志。
- selector 仍使用既有 `recovery.ts`，本轮只拆 QueryModel 内部调用边界。

备选方案：

- 直接把 `recovery.ts` 并入 query model recovery。

不采用原因：

- `recovery.ts` 是更通用的恢复策略模块；本轮只收口 QueryModel 内部，不迁移公共 recovery 策略。

## Risks / Trade-offs

- [Risk] request messages 顺序漂移 -> Mitigation：focused tests 覆盖 continuation request messages。
- [Risk] fallback 空响应路径改变 -> Mitigation：focused tests 覆盖 fallback 返回 null 后继续 recovery。
- [Risk] recovery failure 文案或 compact 行为改变 -> Mitigation：focused tests 覆盖 append failure 与 preflight compact。
- [Risk] 拆分后 import 循环 -> Mitigation：新增模块只依赖 types、service 接口和底层 helper，不反向引用 facade。
