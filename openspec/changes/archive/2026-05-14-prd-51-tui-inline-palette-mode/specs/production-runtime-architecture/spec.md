## MODIFIED Requirements

### Requirement: TUI MUST provide a dedicated keyboard entry for the local command palette
TUI MUST 提供专用 palette 快捷入口，让用户无需手动输入 `/palette`。

#### Scenario: Prompt buffer is empty
- **WHEN** 用户在 TUI 中按下 `Ctrl+K`
- **THEN** 系统展示本地 palette
- **AND** 不进入模型请求链路

#### Scenario: Prompt buffer is not empty
- **WHEN** 用户已经在 prompt 中输入正文内容
- **THEN** `Ctrl+K` 不应抢占当前正文输入
- **AND** 用户可以继续完成当前输入

### Requirement: TUI local command palette MUST expose a dedicated selection surface
TUI 本地 command palette MUST 提供独立的选择面，而不是只输出静态文本结果。

#### Scenario: User opens the palette panel
- **WHEN** 用户通过 `/palette` 或 `Ctrl+K` 打开本地 palette
- **THEN** TUI 展示独立 Palette panel
- **AND** 面板包含 query、结果数量、当前选中项和操作提示

#### Scenario: User moves the current selection
- **WHEN** palette panel 已打开且 prompt buffer 为空
- **THEN** 用户可以通过 `Up` / `Down` 或 `Ctrl+N` / `Ctrl+P` 切换当前选中候选
- **AND** 不进入模型请求链路

### Requirement: TUI local command palette MUST support query submission and direct execution
TUI 本地 command palette MUST 支持本地 query 刷新与当前选中项直接执行。

#### Scenario: User submits a query while palette is open
- **WHEN** palette 已打开且用户输入普通文本后按下回车
- **THEN** 系统刷新本地 palette query
- **AND** 不进入模型请求链路

#### Scenario: User executes the selected palette candidate
- **WHEN** palette 已打开且 prompt buffer 为空时按下回车
- **THEN** 系统执行当前选中候选对应的本地动作
- **AND** 返回明确反馈，说明实际执行了哪个本地命令
