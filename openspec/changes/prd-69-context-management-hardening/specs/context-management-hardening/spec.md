# context-management-hardening Specification

## Purpose

定义 Agent 上下文管理增强能力，包括有效上下文窗口、压缩收益熔断、摘要脱水和状态补偿，避免长会话在接近模型窗口时不可控失败。

## ADDED Requirements

### Requirement: Context manager MUST compute an effective compact threshold

系统 MUST 使用模型上下文窗口与保留预算计算有效压缩阈值，并与用户配置的 compact threshold 取较小值。

#### Scenario: 小窗口模型提前触发压缩

- **WHEN** `modelContextWindowTokens - modelContextReserveTokens` 小于 `compactThresholdTokens`
- **THEN** 自动压缩使用较小的有效阈值

### Requirement: Auto compact MUST stop on ineffective reduction

系统 MUST 在自动压缩后验证 token 降载收益，并在收益低于阈值时明确失败，而不是继续循环压缩。

#### Scenario: 压缩后收益不足

- **WHEN** 自动压缩后的 `reducedBy` 小于 `compactMinReductionTokens`
- **THEN** QueryModel 返回 `recovery_failed`
- **AND** 会话追加明确的 recovery failure assistant message

### Requirement: Compacted context MUST include dehydrated summary and runtime state

系统 MUST 在 compacted message 中包含脱水后的旧消息摘要和当前运行时状态补偿。

#### Scenario: 压缩后恢复当前任务状态

- **WHEN** 自动压缩在有 session、active task、touched paths 的运行时发生
- **THEN** compacted message 包含 session、task、round、touched paths 与 workspace write 状态

### Requirement: Model requests MUST use configurable completion token limit

系统 MUST 使用运行时配置控制模型请求的 `max_tokens`。

#### Scenario: 配置 completion token

- **WHEN** 发起模型请求
- **THEN** OpenAI request 的 `max_tokens` 等于运行时配置的 `modelMaxCompletionTokens`
