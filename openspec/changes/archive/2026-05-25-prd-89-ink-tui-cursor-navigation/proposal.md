# Proposal

## Why

Ink TUI 的 prompt 已经能显示可见 cursor，但输入 reducer 仍然只维护 `draft`，没有维护 cursor index。方向键事件被忽略，所有输入都追加到末尾，backspace 也只删除末尾字符。这不符合基础命令行输入行为，也导致用户在测试时才发现左右键不可用。

## What Changes

- 为 Ink TUI prompt state 增加 `cursorIndex`。
- 支持 left/right/home/end 移动光标。
- 支持在 cursor 位置插入文本。
- backspace/delete 按 cursor 位置删除字符。
- prompt render model 根据 cursor 位置输出最终可见文本。

## Impact

- 影响代码：`apps/agent-cli/src/terminal-ui/ink-tui.tsx`。
- 影响测试：`apps/agent-cli/test/unit/terminal-ui/ink-tui.test.ts`。
- 影响规范：`production-runtime-architecture` 增加 Ink TUI prompt cursor navigation 要求。
