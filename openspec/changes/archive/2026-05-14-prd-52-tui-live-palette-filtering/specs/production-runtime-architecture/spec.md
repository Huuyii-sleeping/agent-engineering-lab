## MODIFIED Requirements

### Requirement: TUI local command palette MUST support query submission and direct execution
TUI 本地 command palette MUST 支持本地 query 刷新与当前选中项直接执行。

#### Scenario: User types while palette is open
- **WHEN** palette 已打开且用户输入普通字符、`backspace` 或 `delete`
- **THEN** 系统即时刷新本地 palette query
- **AND** 不进入模型请求链路

#### Scenario: User executes the selected palette candidate
- **WHEN** palette 已打开且用户按下回车
- **THEN** 系统执行当前选中候选对应的本地动作
- **AND** 返回明确反馈，说明实际执行了哪个本地命令
