## Why

Ink/TSX CLI 在主终端缓冲区中持续重绘，用户滚动到最底部时会看到原生滚动条来回跳动。PRD-83 的 scheduled interval 还会在没有 due reminder 时更新 busy state，进一步制造无内容变化的重绘。

## What Changes

- 交互式 Ink render 启用 `alternateScreen`。
- scheduler tick busy 标记改为 ref，不再因为轮询状态变化触发渲染。
- 空 scheduled tick 不调用 `setState`。
- 新增单元测试确认空 scheduled tick 合并不改变状态对象。

## Impact

- 影响代码：`apps/agent-cli/src/entrypoints/tui-ink.tsx`、`apps/agent-cli/src/terminal-ui/ink-tui.tsx`。
- 影响测试：`apps/agent-cli/test/unit/terminal-ui/ink-tui.test.ts`。
