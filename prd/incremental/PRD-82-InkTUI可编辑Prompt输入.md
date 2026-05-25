# PRD-82 Ink TUI 可编辑 Prompt 输入

## 背景

PRD-81 将 `tui-ink` 改成 Claude Code 风格 REPL surface，但输入区仍是静态 placeholder。用户明确要求 TSX 文件本身就是 CLI 工具，并直接替代/融合现有 CLI，而不是只做展示。

## 目标

- 默认 `agent-cli` 交互入口切换到 Ink/TSX CLI surface。
- 保留 `agent-cli classic` 作为旧 readline CLI 回退入口。
- `tui-ink` 支持本地可编辑 prompt buffer。
- 普通字符输入显示在底部 prompt bar 中。
- `Backspace` 可以删除最近输入。
- `Enter` 将当前 buffer 追加到消息流，并调用现有 `handleTerminalTuiCommand` 复用 slash command、shell shortcut 和 chat runtime。
- 空 buffer 下 `q`、`Esc`、`Ctrl+C` 仍退出 Ink/TSX CLI surface。

## 非目标

- 不迁移现有完整 `tui` 的面板布局和全部快捷键。
- 不实现完整 Vim/历史搜索/多行编辑。

## 验收标准

- 运行默认 `agent-cli` 后进入 Ink/TSX CLI surface。
- 运行 `tui-ink` 后输入内容能显示在 prompt 中，并在回车后进入现有命令/聊天处理链路。
- smoke 测试可以通过管道输入 `/help\nq` 验证提交和退出。
- 单元测试覆盖输入 reducer 的字符、退格、提交、退出判定。
