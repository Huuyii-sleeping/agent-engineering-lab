## Why

PRD-80 的 `tui-ink` 已证明 TSX/Ink 入口可运行，但视觉结构偏 dashboard/card，和用户期望的 Claude Code TSX 终端交互效果不一致。参考 `liuup/claude-code-analysis` 的 `src/components/PromptInput`、`StatusLine`、`design-system/Pane` 和 `messages/*` 后，本轮需要把预览面改成更接近 Claude Code 的 REPL 消息流与底部 prompt 布局。

## What Changes

- 重构 `tui-ink` preview snapshot，从 dashboard panel 数据改为 REPL surface 数据。
- 重写 Ink TSX 组件布局：消息流、slash pane、statusline、底部 prompt bar、footer hints。
- 更新单元测试和 smoke 测试，验证新布局关键文本。

### In Scope

- `apps/agent-cli/src/terminal-ui/ink-tui.tsx` 的预览 UI 结构和文案。
- `tui-ink` 相关单元测试与 smoke 测试。
- OpenSpec 与 PRD 文档。

### Out of Scope

- 不替换 `agent-cli tui`。
- 不完整实现 Claude Code 的 input buffer、overlay、modal、message virtualization。
- 不复制参考仓库源码，只吸收结构性设计模式。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: Ink/TSX 预览入口应采用 REPL-style surface，而不是卡片化 dashboard。

## Impact

- 影响代码：`apps/agent-cli/src/terminal-ui/ink-tui.tsx`。
- 影响测试：`apps/agent-cli/test/unit/terminal-ui/ink-tui.test.ts`、`apps/agent-cli/test/smoke/prd80-ink-tui-smoke.ts`。
- 影响规范：归档后更新 `production-runtime-architecture`。
