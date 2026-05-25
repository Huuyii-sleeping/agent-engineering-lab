# Proposal

## Why

Ink/TSX TUI 当前可以接收键盘输入，但 prompt 区没有显示光标。Ink 渲染不会自动把终端原生光标放到虚拟布局里的输入位置；当前组件也没有显式绘制 cursor，导致用户无法确认输入焦点和插入位置。

## What Changes

- 为 Ink TUI prompt 增加可测试的 prompt view model。
- 交互模式下在 draft 末尾渲染可见 cursor glyph。
- 空 draft 时同时保留 placeholder，并在 placeholder 前显示 cursor。
- 非交互快照允许关闭 cursor，避免脚本模式输出交互噪音。

## Impact

- 影响代码：`apps/agent-cli/src/terminal-ui/ink-tui.tsx`。
- 影响测试：`apps/agent-cli/test/unit/terminal-ui/ink-tui.test.ts`。
- 影响规范：`production-runtime-architecture` 增加 Ink TUI prompt 光标可见性要求。
