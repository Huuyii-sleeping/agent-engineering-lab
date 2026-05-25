## ADDED Requirements

### Requirement: Ink TSX CLI surface MUST provide an editable prompt loop and reuse existing CLI runtime

Ink/TSX CLI surface MUST 提供最小可编辑 prompt 输入闭环，使用户输入能显示在 prompt bar，并能通过 Enter 进入现有 CLI/TUI 命令与聊天处理链路。

#### Scenario: User starts the default interactive CLI
- **WHEN** 用户执行无参数 `agent-cli`
- **THEN** 系统启动 Ink/TSX CLI surface
- **AND** 旧 readline CLI 可通过 `agent-cli classic` 显式启动

#### Scenario: User types into the Ink CLI prompt
- **WHEN** 用户在 `agent-cli tui-ink` 中输入普通字符
- **THEN** 输入内容显示在底部 prompt bar
- **AND** 不会因为内容中包含非退出字符而丢失

#### Scenario: User submits local CLI input
- **WHEN** 用户输入内容并按下 Enter
- **THEN** 当前输入被追加为 user message
- **AND** prompt buffer 被清空
- **AND** 系统通过现有 `handleTerminalTuiCommand` 处理 slash command、shell shortcut 或普通 chat

#### Scenario: User exits from an empty prompt
- **WHEN** prompt buffer 为空且用户按下 `q`、`Esc` 或 `Ctrl+C`
- **THEN** `tui-ink` 正常退出
