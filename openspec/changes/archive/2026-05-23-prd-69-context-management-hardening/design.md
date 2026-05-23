## Overview

本变更在现有压缩链路上做增强，不重写主循环。核心策略是把“是否压缩”“压缩是否有效”“压缩后模型能否继续理解当前状态”都变成显式可测试的运行时行为。

## Decisions

### 有效上下文阈值

新增配置：

- `AGENT_MODEL_CONTEXT_WINDOW_TOKENS`
- `AGENT_MODEL_CONTEXT_RESERVE_TOKENS`
- `AGENT_MODEL_MAX_COMPLETION_TOKENS`
- `AGENT_COMPACT_MIN_REDUCTION_TOKENS`

自动压缩阈值为：

```text
min(compactThresholdTokens, max(100, modelContextWindowTokens - modelContextReserveTokens))
```

这样仍兼容现有默认 `50000`，但在模型窗口较小时会提前压缩，并为 completion、tool schema、system prompt 留出保留预算。

### 压缩摘要脱水

旧消息不会原样复灌进 compacted message。摘要记录：

- 角色。
- 文本内容的短摘要。
- tool call 数量和名称。
- tool result 名称。
- 非文本内容/多模态内容计数。
- 被摘要消息数量与保留 recent 数量。

完整压缩前后 transcript 继续按既有规则脱敏落盘，用于调试和审计。

### 状态补偿

`CompactRuntimeContext` 增加可选 `state`。自动压缩从 `runtimeState` 传入：

- `sessionId`
- `activeTaskId`
- `roundCounter`
- `touchedPaths`
- `wroteWorkspaceFiles`

这些状态以短块写入 compacted message，帮助压缩后模型恢复当前任务边界。

### 压缩收益熔断

preflight auto compact 执行后，若 `reducedBy < compactMinReductionTokens` 或压缩后估算仍大于等于压缩前，视为低收益压缩。系统记录 recovery decision/error，并返回 `recovery_failed`，避免重复压缩无效上下文。

### Completion Token 配置化

`runQueryModelCompletionRequest()` 使用 `RUNTIME_CONFIG.modelMaxCompletionTokens`，替代硬编码 `8000`。

## Risks

- 字符数估算仍不是模型供应商真实 token counter，因此这是稳态护栏，不是精确预算器。
- 状态补偿只能恢复本地 runtime 已知状态，不替代完整 transcript。

## Rollout

小步落地，默认值保持当前行为接近不变。通过 unit/smoke 验证后提交。
