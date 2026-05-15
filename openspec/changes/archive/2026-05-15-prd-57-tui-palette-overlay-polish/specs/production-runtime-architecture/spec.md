## MODIFIED Requirements

### Requirement: TUI local command palette MUST expose a dedicated selection surface
TUI 本地 command palette MUST 提供独立的选择面，而不是只输出静态文本结果。

#### Scenario: User opens the palette panel
- **WHEN** 用户通过 `/palette` 或 `Ctrl+K` 打开本地 palette
- **THEN** TUI 展示顶部 `Command Bar`
- **AND** `Command Bar` 与 `Palette Results` 采用共享的轻量居中浮层布局，而不是一个全宽一个局部居中

#### Scenario: User moves the current selection
- **WHEN** palette panel 已打开
- **THEN** 用户可以通过 `Up` / `Down` 或 `Ctrl+N` / `Ctrl+P` 切换当前选中候选
- **AND** 不进入模型请求链路

#### Scenario: User scans grouped compact palette results
- **WHEN** palette 已打开且用户查看当前候选
- **THEN** TUI 在结果中明确展示分组与 query 命中
- **AND** command bar 展示当前选中候选的 preview summary
- **AND** overlay 以更紧凑的命令优先结果行和精简 keys hint 展示当前可执行动作
