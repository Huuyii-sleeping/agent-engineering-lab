## ADDED Requirements

### Requirement: Subagent execution boundary refactors MUST preserve base-tool loop and model policy semantics
子代理执行边界重构 MUST 保持既有 base tools 白名单、tool-calling 循环、预算拒绝、fallback 与 usage finalize 语义不变，同时允许这些职责由 executor 承接。

#### Scenario: 保持 base tool loop
- **WHEN** 子代理模型响应包含一个或多个 function tool calls
- **THEN** subagent executor 仍会按顺序执行 base tools，并在补入 `role: tool` 消息后继续下一轮

#### Scenario: 保持预算拒绝语义
- **WHEN** 统一模型策略为子代理请求返回 `budgetAction=deny`
- **THEN** subagent executor 仍会终止执行并返回 `MODEL_BUDGET_DENIED:*` 失败结果

#### Scenario: 保持 fallback 与 finalize usage 语义
- **WHEN** 主模型请求因可回退错误失败且存在 fallback model
- **THEN** subagent executor 仍会切换到 fallback model 重试，并按最终模型记录 usage finalize
