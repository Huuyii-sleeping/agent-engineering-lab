## ADDED Requirements

### Requirement: Query loop observability MUST tag local user input intent

系统 MUST 在 query round 开始时为本地 `loop_start` observability 事件附加最小化用户输入意图标签，用于本地 replay、诊断与产品问题定位。

#### Scenario: 用户输入包含负面反馈意图
- **WHEN** 最新用户输入包含常见负面反馈表达
- **THEN** `loop_start` 事件的 `userInputIntent.negativeFeedback` 为 `true`
- **AND** 事件不新增保存完整原始 prompt 的字段

#### Scenario: 用户输入包含继续执行意图
- **WHEN** 最新用户输入包含继续执行或不要停止的表达
- **THEN** `loop_start` 事件的 `userInputIntent.keepGoing` 为 `true`
- **AND** query 主流程仍按原有逻辑继续执行，不因标签被阻断或改写

#### Scenario: 用户输入没有匹配意图
- **WHEN** 最新用户输入没有匹配负面反馈或继续执行表达
- **THEN** `loop_start` 事件仍包含 `userInputIntent`
- **AND** `negativeFeedback` 与 `keepGoing` 均为 `false`
