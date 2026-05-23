# error-recovery-retries Delta

## MODIFIED Requirements

### Requirement: Agent loop SHALL compact and retry on overlong context

当请求前估算上下文超有效阈值，或请求返回 context-too-long 类错误时，系统 SHALL 优先压缩上下文并在预算内重试；如果压缩低收益，则 SHALL 明确失败，避免无效重试。

#### Scenario: 上下文过长触发压缩恢复

- **WHEN** 请求上下文超过有效压缩阈值或 API 明确返回上下文过长错误
- **THEN** Agent 先压缩历史，再重试模型请求

#### Scenario: 压缩低收益触发熔断

- **WHEN** 压缩后的 token 降载收益低于配置阈值
- **THEN** 系统记录 recovery failure 并返回 `recovery_failed`
