## ADDED Requirements

### Requirement: TUI MUST expose lightweight keyboard shortcuts for high-frequency local actions
TUI MUST 提供轻量键盘快捷键，让高频本地动作不再只能依赖 slash command。

#### Scenario: User cycles sessions with keyboard shortcuts
- **WHEN** 用户在 TUI 中按下 `Ctrl+N` 或 `Ctrl+P`
- **THEN** 系统分别切换到下一个或上一个 session
- **AND** 不进入模型请求链路

#### Scenario: User redraws or cancels draft with keyboard shortcuts
- **WHEN** 用户在 TUI 中按下 `Ctrl+L` 或在草稿模式下按下 `Esc`
- **THEN** 系统分别执行重绘或取消草稿
- **AND** 不进入模型请求链路

### Requirement: TUI keyboard shortcuts MUST not hijack active prompt content entry
TUI 键盘快捷键 MUST 不得在用户正在输入正文内容时劫持输入，避免破坏 prompt 编辑。

#### Scenario: Prompt buffer is not empty
- **WHEN** 用户已经在 prompt 中输入了正文内容
- **THEN** 全局快捷键不应触发本地动作
- **AND** 用户继续完成当前输入

### Requirement: TUI surfaces MUST advertise available keyboard shortcuts
TUI 的交互面 MUST 明确展示可用快捷键，避免功能隐藏。

#### Scenario: User views TUI dashboard
- **WHEN** 用户查看 TUI 主界面
- **THEN** banner、controls 或 footer 至少一处展示快捷键提示
