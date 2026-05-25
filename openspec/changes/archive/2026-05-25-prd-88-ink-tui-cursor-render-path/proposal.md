# Proposal

## Why

PRD-87 后 prompt render model 中有 cursor 字段，但用户实际 TUI 中仍未看到光标。问题在于测试没有覆盖最终 prompt 可见文本，而且反色 block glyph 依赖终端样式表现，不够直接。

## What Changes

- prompt render model 增加 `visibleText`，表达最终可见输入文本。
- cursor glyph 改为 `▌`，直接拼入 `visibleText`。
- Ink prompt 渲染使用 `visibleText` 的分段结果，保证 draft 后一定有可见插入符。

## Impact

- 影响代码：`apps/agent-cli/src/terminal-ui/ink-tui.tsx`。
- 影响测试：`apps/agent-cli/test/unit/terminal-ui/ink-tui.test.ts`。
- 影响规范：`production-runtime-architecture` 细化 cursor 必须出现在最终可见 prompt 文本。
