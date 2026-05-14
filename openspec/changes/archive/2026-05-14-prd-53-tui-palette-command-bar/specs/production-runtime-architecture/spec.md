## MODIFIED Requirements

### Requirement: TUI local command palette MUST expose a dedicated selection surface
TUI 本地 command palette MUST 提供独立的选择面，而不是只输出静态文本结果。

#### Scenario: User opens the palette panel
- **WHEN** 用户通过 `/palette` 或 `Ctrl+K` 打开本地 palette
- **THEN** TUI 展示顶部 `Command Bar`
- **AND** TUI 以紧凑结果浮层块展示候选，而不是继续侵入主会话区
