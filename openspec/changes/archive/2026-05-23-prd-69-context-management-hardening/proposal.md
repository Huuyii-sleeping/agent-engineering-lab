## Why

当前上下文压缩已经可用，但仍以固定阈值和简单摘要为主。参考 `04f-context-management.md` 后，需要把它补强为更接近生产 Agent 的上下文管理链路：在接近有效窗口前主动压缩，压缩失败时熔断，并在压缩后恢复必要运行时状态。

## What Changes

- 新增上下文有效窗口配置：模型窗口、保留预算、completion token、最小压缩收益。
- 自动压缩触发改为使用有效 compact threshold，而不是只读固定 `compactThresholdTokens`。
- `compactMessages()` 增加旧消息脱水摘要和运行时状态补偿。
- preflight auto compact 增加低收益熔断，避免压缩后仍超限时重复尝试到失败才停止。
- 模型请求 `max_tokens` 改为读取运行时配置。

In Scope:
- QueryModel preflight context 管理。
- context compact 工具摘要质量和状态补偿。
- runtime config、unit test、smoke test。

Out of Scope:
- 不实现后台摘要子代理。
- 不实现 OS/模型供应商专有的真实 token counter。
- 不重构长期 memory 系统。

## Capabilities

### New Capabilities
- `context-management-hardening`: 定义有效窗口、压缩收益熔断、压缩摘要脱水和状态补偿能力。

### Modified Capabilities
- `context-compression`: 自动压缩触发与摘要内容增强。
- `error-recovery-retries`: context-too-long 恢复增加压缩收益判断和明确失败。
- `model-policy-budget-fallback`: 模型请求 completion token 配置化，不改变路由和预算语义。

## Impact

- 影响 `apps/agent-cli/src/runtime-config.ts`、`apps/agent-cli/src/tools/context-compact.ts`、`apps/agent-cli/src/runtime/query-model.ts`、`apps/agent-cli/src/runtime/query-model-recovery.ts`、`apps/agent-cli/src/runtime/query-model-request.ts`。
- 增加/更新 `apps/agent-cli/test/unit/**` 和 smoke 测试。
- 不新增运行时依赖。
