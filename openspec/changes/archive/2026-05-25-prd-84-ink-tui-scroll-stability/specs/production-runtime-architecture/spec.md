## ADDED Requirements

### Requirement: Ink TSX CLI surface MUST avoid idle scrollback jitter

Ink/TSX CLI surface MUST avoid writing idle scheduled poll frames into the primary terminal scrollback while running as an interactive TTY.

#### Scenario: Interactive Ink TUI starts
- **WHEN** 用户在 TTY 中启动 Ink/TSX CLI surface
- **THEN** 系统使用 alternate screen 渲染交互界面
- **AND** 主终端 scrollback 不会被每次 TUI frame 重绘污染

#### Scenario: Scheduled poll finds no due prompt
- **WHEN** scheduler interval tick 完成
- **AND** 没有 due scheduled prompt
- **THEN** Ink TUI 不追加消息
- **AND** 不触发可见界面重绘

#### Scenario: Non-interactive smoke rendering
- **WHEN** Ink/TSX CLI 运行在非 TTY 管道输入模式
- **THEN** 系统保持普通 stdout 输出
- **AND** 不启用 alternate screen
