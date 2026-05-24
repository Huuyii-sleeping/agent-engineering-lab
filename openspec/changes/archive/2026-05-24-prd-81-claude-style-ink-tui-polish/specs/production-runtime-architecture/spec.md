## ADDED Requirements

### Requirement: Ink TSX preview MUST render as a REPL-style terminal surface

Ink/TSX 预览入口 MUST 采用 REPL-style terminal surface，包含消息流、状态行、底部 prompt 输入区和 footer hints，而不是以多个 dashboard card 作为主体布局。

#### Scenario: User starts the polished Ink TSX preview
- **WHEN** 用户执行 `agent-cli tui-ink`
- **THEN** 系统展示 REPL-style 消息流
- **AND** 底部展示 prompt 输入区、statusline 和 footer hints

#### Scenario: Preview keeps existing command behavior
- **WHEN** 用户按下 `q`、`Esc` 或 `Ctrl+C`
- **THEN** `tui-ink` 仍正常退出
- **AND** 不影响 `agent-cli tui` 的既有行为
