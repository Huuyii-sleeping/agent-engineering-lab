## ADDED Requirements

### Requirement: CLI and TUI MUST expose a local command palette for high-frequency actions
CLI / TUI MUST 提供本地 command palette，让用户不必先记住完整命令再输入。

#### Scenario: User opens the command palette
- **WHEN** 用户输入 `/palette` 或在 TUI 中触发 palette 快捷入口
- **THEN** 系统展示高频本地动作候选
- **AND** 不进入模型请求链路

#### Scenario: User fuzzy-searches palette candidates
- **WHEN** 用户输入 `/palette review`
- **THEN** 系统返回与该查询最相关的本地候选
- **AND** 候选可以来自 help、session、transcript 或 runtime 控制面

### Requirement: Local command palette MUST support direct candidate execution
本地 command palette MUST 支持直接执行候选，避免用户找到候选后还要再次完整输入命令。

#### Scenario: User opens one palette candidate by index
- **WHEN** 用户输入 `/palette open 2`
- **THEN** 系统执行最近一次 palette 结果中的第 2 个候选对应的本地动作
- **AND** 返回明确反馈，说明实际执行了哪个本地命令

#### Scenario: User references an unknown palette result index
- **WHEN** 用户输入 `/palette open 9`
- **THEN** 系统返回稳定错误
- **AND** 提示用户先重新运行 `/palette`

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
