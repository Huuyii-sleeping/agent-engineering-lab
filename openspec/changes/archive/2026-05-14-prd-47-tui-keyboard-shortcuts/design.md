## Context

在 PRD-46 之后，会话导航已经具备产品面，但操作依然停留在 slash command。对 TUI 来说，这还不够像一个成熟的终端工具，因为最常用的本地动作应该能通过更直接的键盘交互完成。

当前实现约束也很明确：

- TUI 仍建立在 readline 循环上。
- 不适合在这一轮直接引入复杂 raw-mode UI 框架。
- 需要避免快捷键污染正在输入的正文内容。

## Goals / Non-Goals

**Goals:**

- 为 TUI 增加少量高价值快捷键。
- 保持实现轻量，复用已有 slash command 语义。
- 在等待输入时也能安全重绘并保留 prompt 状态。

**Non-Goals:**

- 不做完整键盘导航系统。
- 不做 vim/emacs 风格编辑器键位。
- 不为普通交互 CLI 引入 raw-mode 快捷键。

## Decisions

### Decision 1: 快捷键只映射到现有本地命令

采纳：

- 快捷键层只解析按键，再转发到已有 `/next`、`/prev`、`/redraw`、`/cancel`。

不采用：

- 为快捷键单独实现一套平行逻辑。

原因：

- 复用现有命令可以降低分叉和测试成本。

### Decision 2: 仅在输入缓冲为空时触发全局快捷键

采纳：

- 只有当前 prompt 没有正文输入时，`Ctrl+N/P/L` 和 `Esc` 才会作为全局快捷键生效。

不采用：

- 无条件劫持按键。

原因：

- 这样可以避免干扰正常输入，也避免把用户正在写的 prompt 打断。

### Decision 3: 先做 4 个高频快捷键，不扩展到更多键位

采纳：

- `Ctrl+N`、`Ctrl+P`、`Ctrl+L`、`Esc`

不采用：

- 一次性加入大量键位和焦点系统。

原因：

- 这 4 个动作价值最高，且几乎不涉及歧义。

## Risks / Trade-offs

- [raw mode 与终端兼容性] -> 仅在 TTY 且支持 `setRawMode` 时启用，非 TTY 保持原行为。
- [快捷键打断正文输入] -> 只在输入缓冲为空时触发。
- [用户不知道快捷键存在] -> 在 help、controls、footer 中同步暴露。
