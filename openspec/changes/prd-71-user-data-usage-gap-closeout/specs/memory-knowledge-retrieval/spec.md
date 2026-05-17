## ADDED Requirements

### Requirement: Memory surfaces MUST disclose memory classes and support state
memory 相关 surface MUST 明确区分当前仓库已经实现的本地 memory 类型，与尚未实现的 shared/team memory 类型，避免把所有 memory 都描述成同一数据面。

#### Scenario: User inspects memory classes
- **WHEN** 用户检查 memory 数据治理信息
- **THEN** 系统列出短期记忆、长期记忆、会话摘要或等价本地记忆类别
- **AND** 将 shared/team memory sync 显式标记为 `保留缺口` 或 `未支持`，如果当前仓库没有该能力

#### Scenario: Memory injection reason is surfaced
- **WHEN** 某类 memory 被用于当前模型请求
- **THEN** 系统能够说明被注入的是哪一类 memory
- **AND** 解释其进入模型的原因，例如相关性命中、上下文补偿或长期偏好保持
