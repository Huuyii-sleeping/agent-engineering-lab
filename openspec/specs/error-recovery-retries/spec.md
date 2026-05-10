# error-recovery-retries Specification

## Purpose
TBD - created by archiving change prd-16-error-recovery-retries. Update Purpose after archive.

## Requirements
### Requirement: Recovery selector SHALL emit an explicit structured action
系统 SHALL 将可恢复失败分类为显式结构化动作：`continue | compact | backoff | fail`，而不是在主循环内隐式散落判断。

#### Scenario: 输出结构化恢复决策
- **WHEN** Agent 遇到输出截断、上下文过长或瞬时传输错误
- **THEN** 系统返回明确的恢复动作与原因，而不是直接崩溃或无限重试

### Requirement: Recovery paths MUST enforce independent attempt budgets
系统 MUST 为续写、压缩、传输重试分别维护独立预算，至少包括 `continuation_attempts`、`compact_attempts` 与 `transport_attempts`。

#### Scenario: 某条恢复路径预算耗尽
- **WHEN** 某类恢复路径达到其最大尝试次数
- **THEN** 系统停止该路径的继续重试，并返回明确失败原因

### Requirement: Agent loop SHALL continue after output truncation
当模型因 `max_tokens` 或等效长度终止而截断输出，且当前响应不含 tool calls 时，系统 SHALL 注入续写提示继续生成，而不是从头重新回答。

#### Scenario: 截断后续写
- **WHEN** 模型响应的 `finish_reason` 为长度截断
- **THEN** Agent 使用“从上次中断处继续且不要重复”的提示发起后续请求，并合并最终 assistant 输出

### Requirement: Agent loop SHALL compact and retry on overlong context
当请求前估算上下文超阈值，或请求返回 context-too-long 类错误时，系统 SHALL 优先压缩上下文并在预算内重试。

#### Scenario: 上下文过长触发压缩恢复
- **WHEN** 请求上下文超过阈值或 API 明确返回上下文过长错误
- **THEN** Agent 先压缩历史，再重试模型请求

### Requirement: Agent loop SHALL back off and retry transient transport failures
对 timeout、rate limit、unavailable、connection 及等效瞬时传输故障，系统 SHALL 在预算内执行退避重试。

#### Scenario: 瞬时故障触发 backoff
- **WHEN** 模型请求遭遇瞬时 API/连接故障
- **THEN** Agent 按 backoff 策略等待后重试，并在预算耗尽后明确失败
