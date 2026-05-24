## ADDED Requirements

### Requirement: TUI MAY expose an Ink TSX preview surface without replacing the existing TUI

TUI 交互面 MAY 提供独立 Ink/TSX 预览入口，用组件化方式渲染终端 UI；该入口 MUST 与现有 `agent-cli tui` 并存，且不得改变现有 TUI 默认行为。

#### Scenario: User starts the Ink TSX preview
- **WHEN** 用户执行 `agent-cli tui-ink` 或 `agent-cli --tui-ink`
- **THEN** 系统启动 Ink/TSX 终端 UI 预览入口
- **AND** 该入口展示组件化 dashboard、runtime 状态、快捷键与 palette 摘要

#### Scenario: Existing TUI remains unchanged
- **WHEN** 用户执行 `agent-cli tui`
- **THEN** 系统仍启动原有 TUI 实现
- **AND** 不要求用户迁移到实验性 Ink/TSX 入口

#### Scenario: Preview can exit in automated smoke checks
- **WHEN** Ink/TSX 预览入口从 stdin 收到 `q`、`Esc` 或 `Ctrl+C`
- **THEN** 系统退出预览入口
- **AND** 命令返回成功状态码
