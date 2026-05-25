## Why

`tui-ink` 目前已具备 Claude 风格 REPL 布局，但 prompt 只是静态 placeholder，用户输入不会显示也不会提交。用户明确要求 TSX/Ink 入口直接替代并融合现有 CLI，因此本轮需要把默认 interactive CLI 切到 Ink surface，并让输入提交复用现有 CLI/TUI runtime。

## What Changes

- 默认 `agent-cli` 交互入口启动 Ink/TSX CLI surface。
- 新增 `agent-cli classic` 回退入口，保留旧 readline CLI。
- 新增 Ink TUI prompt reducer，处理字符输入、退格、回车提交和退出判定。
- `InkTuiPreviewApp` 使用 `useInput` 维护本地 prompt buffer 和消息流。
- 回车提交后调用现有 `handleTerminalTuiCommand`，复用 slash command、shell shortcut 和 chat runtime。
- 更新 smoke 测试，验证 `/help\nq` 可以提交本地命令并退出。

### In Scope

- 默认 Ink/TSX CLI surface。
- `tui-ink` 本地输入缓冲区。
- 本地消息流追加。
- 复用现有命令处理链路。
- 单元测试与 smoke 测试。

### Out of Scope

- 不替换 `agent-cli tui`。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: Ink/TSX CLI surface 必须融合默认 interactive CLI，并提供最小可编辑 prompt 输入闭环。

## Impact

- 影响代码：`apps/agent-cli/src/terminal-ui/ink-tui.tsx`、`apps/agent-cli/src/entrypoints/tui-ink.tsx`。
- 影响测试：Ink TUI 单元测试、PRD-80 smoke。
