## ADDED Requirements

### Requirement: Prompt inspection surfaces MUST support protected export modes
`/prompt` 与等效 system prompt inspection surface MUST 区分默认 inspection 与受保护导出模式；默认模式 MUST 最小暴露敏感动态上下文，避免完整 system prompt 与补充 system messages 被无门槛长期扩散。

#### Scenario: User dumps the current prompt in default mode
- **WHEN** 用户执行普通 prompt dump / inspection
- **THEN** 系统输出经过最小暴露处理的 prompt 内容或结构摘要
- **AND** 不直接暴露需要受保护的敏感动态上下文

#### Scenario: User requests protected prompt export
- **WHEN** 用户显式请求完整 prompt 导出
- **THEN** 系统要求进入受保护导出路径
- **AND** 该导出结果接入 retention / cleanup 约束

