## Why

当前 CLI / TUI 已经支持多 session，但切换入口仍然偏原型：`/use` 只能精确命中完整 session id，TUI 也没有更顺手的循环切换和清晰的选择提示。随着 session 数量变多，这会明显拉低终端交互效率。

## What Changes

- 强化 `/use`，支持索引、唯一前缀和 `latest` 这类更顺手的会话选择方式。
- 新增 `/next` 和 `/prev`，支持在本地会话间循环切换。
- 优化 `/sessions` 输出和 TUI Sessions panel，明确展示序号、active 状态和切换提示。
- 更新 CLI / TUI 的 help、banner、controls、footer，让会话导航入口更可发现。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `production-runtime-architecture`: 补充 CLI / TUI 本地 session 导航与切换的人机交互 requirement

## Impact

- 影响代码：
  - `apps/agent-cli/src/cli-commands.ts`
  - `apps/agent-cli/src/cli-ui.ts`
  - `apps/agent-cli/src/entrypoints/tui.ts`
- 影响测试：
  - `apps/agent-cli/test/unit/cli-commands.test.ts`
  - `apps/agent-cli/test/unit/cli-ui.test.ts`
  - `apps/agent-cli/test/unit/entrypoints/tui.test.ts`
