## MODIFIED Requirements

### Requirement: TUI local command palette MUST expose a dedicated selection surface
TUI 本地 command palette MUST 提供独立的选择面，而不是只输出静态文本结果。

#### Scenario: User scans compact palette results
- **WHEN** palette 已打开且本地 query 非空
- **THEN** TUI 在结果中明确标记 query 命中
- **AND** command bar 展示当前选中候选的 preview summary
