# PRD-47 TUI 键盘快捷键抛光

## 背景

现在的 TUI 已经有多 session、composer 和较完整的状态面，但本地动作仍然主要依赖 slash command。对一个日常使用的终端 Agent 来说，这会让高频动作显得偏慢。

## 目标

- 为 TUI 增加少量高价值快捷键。
- 优先覆盖本地、高频、无副作用的动作。
- 保持安全边界，不打断用户正在输入的正文内容。

## In Scope

- `Ctrl+N`：下一会话
- `Ctrl+P`：上一会话
- `Ctrl+L`：重绘
- `Esc`：取消草稿
- TUI 文案提示更新
- focused tests、build、OpenSpec strict

## Out of Scope

- 完整键盘导航系统
- vim/emacs 风格编辑器体验
- 普通交互 CLI 的 raw-mode 快捷键

## 验收标准

- 在 TTY 中，`Ctrl+N/P/L` 和 `Esc` 能触发对应本地动作。
- 当 prompt buffer 非空时，全局快捷键不抢占正文输入。
- TUI 的 help / controls / footer 至少一处明确展示快捷键。
- focused tests、build、OpenSpec strict 通过。
