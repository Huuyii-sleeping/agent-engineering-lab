# QueryModel 模型请求模块边界收口

## 这次真正学到的东西
### 1. query-model 不是单个 API 调用函数，而是模型请求管线

`runtime/query-model.ts` 原来同时负责：
- prompt envelope 组装
- request messages 构造
- token estimate 与 preflight compact
- model policy selection 与 budget deny
- OpenAI chat completion request
- usage finalize
- 主模型失败后的 fallback request
- response recovery：截断续写
- error recovery：compact、backoff、fail
- model request / response / policy / recovery observability

这说明它本质上是“请求构造 + 模型策略 + 降级重试 + 恢复动作 + public orchestration”的组合。继续全部放在一个文件里，后续只要调模型策略、请求参数或恢复预算，就容易误碰主循环对 `requestQueryModel` 的期待。

### 2. 这块最自然的边界是 types / request / fallback / recovery / orchestration

这一轮拆完之后，内部入口更明确：
- `query-model-types.ts`
  - 放 `QueryModelResult`、`RequestQueryModelOptions`、`QueryModelCompletionResult`
- `query-model-request.ts`
  - 放 request messages 构造
  - 放 request 文本摘要
  - 放 OpenAI request 调用和 response 归一化
- `query-model-fallback.ts`
  - 放 fallbackable 判断后的 fallback model selection
  - 放 fallback request、fallback policy event 和 usage finalize
- `query-model-recovery.ts`
  - 放 recovery failure 追加
  - 放 recovery decision 事件记录
  - 放 preflight compact 和 recovery 日志 helper
- `query-model.ts`
  - 保留 `requestQueryModel` 主编排

这样后续如果要调整 request shape，优先改 request；如果要调整 fallback，优先改 fallback；如果要调整 compact / continuation / backoff 的 QueryModel 调用方式，优先改 recovery；如果要调整主流程顺序，再改 orchestration。

## 放到本仓库里怎么理解
### 当前已经有的基础

- `model-policy-budget-fallback` spec 已经定义角色路由、预算守卫、fallback once 和 usage 记录
- `error-recovery-retries` spec 已经定义 continuation、compact、backoff 和 recovery budget
- `prompt/builder.ts` 已经提供稳定 prompt envelope
- `query-engine.ts` 只依赖 `requestQueryModel` public API

### 当前最明显的差距

- 原 `query-model.ts` 聚合了请求协议、模型策略、降级和恢复动作
- request messages 构造没有独立 focused tests
- fallback 成功、非 fallbackable、空响应路径没有模块级测试锁定
- recovery failure append 和 preflight compact 逻辑没有独立测试锁定

### 这轮只解决哪些差距

- 这轮要做的：拆 QueryModel 内部边界，补 focused tests，新增沉淀文档
- 这轮不做的：不改模型角色，不改预算策略，不改 fallback 次数，不改 compact/continuation/backoff 预算，不改 `requestQueryModel` public API

## 这轮采纳了什么
### 采纳

- 新增 `query-model-types.ts`

集中承接：
- `QueryModelResult`
- `RequestQueryModelOptions`
- `QueryModelCompletionResult`

- 新增 `query-model-request.ts`

承接 request 边界：
- `summarizeQueryModelText`
- `buildQueryModelRequestMessages`
- `runQueryModelCompletionRequest`

这里保留原有语义：
- system prompt 在最前
- supplemental system messages 紧随其后
- history messages 保持原顺序
- continuation 时追加上一段 assistant content 和 continuation prompt
- OpenAI request 仍传 `model`、`messages`、`tools`、`max_tokens: 8000`

- 新增 `query-model-fallback.ts`

承接 fallback 边界：
- `classifyFallbackableError`
- `selectFallbackModel`
- fallback request
- fallback `model_policy_selection` event
- fallback usage finalize

fallback 失败或空响应仍返回 `null`，由主编排继续进入 recovery selector。

- 新增 `query-model-recovery.ts`

承接 QueryModel 内部 recovery helper：
- `appendQueryModelRecoveryFailure`
- `recordQueryModelRecoveryDecision`
- `applyQueryModelPreflightRecovery`
- `compactQueryModelMessages`
- continuation / backoff 日志 helper

- 收窄 `query-model.ts`

现在 `query-model.ts` 主要保留：
- prompt envelope 构建
- request / policy / response / recovery / fallback 的主流程顺序
- `requestQueryModel` public API

- 新增 focused tests

覆盖：
- request messages 构造和 continuation prompt
- request response 归一化和空响应
- fallback 成功、非 fallbackable、fallback 空响应
- recovery failure append
- preflight compact decision 与 messages mutation

### 暂不采纳

- 暂不改变 model policy 角色

QueryModel 仍然使用 `coding` role。多角色拆分是策略问题，不应该混进本轮边界收口。

- 暂不改变 fallback 次数或 fallback 条件

fallback once 是当前 spec 的明确语义。本轮只迁移原逻辑，不扩大重试面。

- 暂不改变 recovery selector

`recovery.ts` 仍然是统一恢复策略来源。QueryModel recovery 模块只承接 QueryModel 内部调用动作，不把全局恢复策略搬进 runtime 子目录。

- 暂不改变 OpenAI request 参数

`max_tokens`、tools 传递和 message shape 都保持不变，避免把边界拆分变成行为变更。

## 这轮实际改成了什么
- `query-model-types.ts` 承接共享类型
- `query-model-request.ts` 承接 request messages、OpenAI request 与 response 归一化
- `query-model-fallback.ts` 承接 fallback model retry 与 usage finalize
- `query-model-recovery.ts` 承接 recovery failure、preflight compact 与日志 helper
- `query-model.ts` 收成 public orchestration facade
- 新增 focused unit tests 锁住拆分后最容易漂移的语义

改完之后，后续变更入口更明确：
- 调整 request messages 或 request 参数，优先改 `query-model-request.ts`
- 调整 fallback 选择、fallback event 或 usage finalize，优先改 `query-model-fallback.ts`
- 调整 QueryModel 内部 compact / failure / recovery 日志动作，优先改 `query-model-recovery.ts`
- 调整主流程顺序，再改 `query-model.ts`

## 下一步最自然的动作
1. 继续检查 `runtime/query-tools.ts` 或 `runtime/query-finalization.ts` 是否还有可收口的内部策略边界。
2. 如果后续要做多角色模型请求，单独开 PRD 处理 role routing，不要混入边界拆分。
3. 如果要调整 recovery budget 或日志格式，优先从 `recovery.ts` 的公共策略层开始设计。
