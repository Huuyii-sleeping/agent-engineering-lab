## ADDED Requirements

### Requirement: Prompt inspection MUST disclose categories suppressed by privacy posture
当隐私规避控制导致某些模型输入类别被抑制时，prompt inspection 或等价治理 surface MUST 显式披露这些类别当前未参与模型请求，而不是让它们只是静默消失。

#### Scenario: Memory injection is suppressed by privacy posture
- **WHEN** 用户启用了关闭 auto memory injection 的隐私姿态
- **THEN** prompt inspection 明确标记 `memory_context` 当前被抑制
- **AND** 说明未进入当前模型请求的原因是隐私控制而非无命中

#### Scenario: External or remote-derived context is suppressed
- **WHEN** 用户启用了 local-only 或 external-capabilities disabled 等隐私姿态
- **THEN** prompt inspection 明确标记相关外部上下文类别未参与本轮模型请求
- **AND** 不要求用户通过比对原始 prompt dump 自行推断
