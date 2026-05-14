## ADDED Requirements

### Requirement: CLI and TUI MUST provide ergonomic local session selection
CLI / TUI MUST 提供顺手的本地 session 选择方式，避免用户只能依赖完整 session id 进行切换。

#### Scenario: User switches by index or latest selector
- **WHEN** 用户输入 `/use 2` 或 `/use latest`
- **THEN** 系统切换到对应 session
- **AND** 返回明确的当前会话反馈

#### Scenario: User switches by unique session id prefix
- **WHEN** 用户输入 `/use abc123`
- **THEN** 若该前缀唯一命中某个 session id，系统切换到该 session
- **AND** 若命中多个 session，则返回歧义错误

### Requirement: CLI and TUI MUST support sequential session navigation
CLI / TUI MUST 支持按当前 session 列表顺序前后循环切换，减少多会话场景中的跳转成本。

#### Scenario: User moves to next session
- **WHEN** 用户输入 `/next`
- **THEN** 系统切换到当前顺序中的下一个 session
- **AND** 若当前已在最后一个 session，则循环回第一个

#### Scenario: User moves to previous session
- **WHEN** 用户输入 `/prev`
- **THEN** 系统切换到当前顺序中的上一个 session
- **AND** 若当前已在第一个 session，则循环回最后一个

### Requirement: Session surfaces MUST expose clear navigation affordances
会话相关交互面 MUST 明确展示 session 序号、active 状态和切换提示，而不是只展示被动状态信息。

#### Scenario: Sessions list exposes selection hints
- **WHEN** 用户查看 `/sessions`
- **THEN** 输出显示 session index、active marker、busy/idle 和 message count

#### Scenario: TUI sessions panel exposes navigation hints
- **WHEN** 用户查看 TUI 仪表盘
- **THEN** Sessions panel 与 controls / footer 显示 `/use`、`/next`、`/prev` 相关提示
