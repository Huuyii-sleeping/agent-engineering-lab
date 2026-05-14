## Why

PRD-44 已经把 composer 模式做出来了，但离真正可用还有一段距离：空行会被吞掉，草稿只能追加不能本地撤回，TUI 里也只有轻量状态提示，没有独立 draft 可视面。对于代码块、日志片段和长任务编排，这会直接破坏输入体验。

## What Changes

- 保留 composer 模式下用户输入的空行，不再因为 readline / TUI 的空输入分支而丢失。
- 新增 `/pop [n]`，允许本地撤回最近 1 到 N 行草稿。
- 强化 `/preview` 输出，提供更清晰的草稿结构展示。
- TUI 增加 draft 可视面板与更明确的 composer 状态提示，让草稿态不再只存在于 prompt/footer。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `production-runtime-architecture`: 补充 CLI/TUI composer 在草稿编辑、回退和可视面上的 requirement

## Impact

- 影响代码：
  - `apps/agent-cli/src/cli.ts`
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - `apps/agent-cli/src/cli-composer.ts`
  - `apps/agent-cli/src/cli-commands.ts`
  - `apps/agent-cli/src/cli-ui.ts`
- 影响测试：
  - `apps/agent-cli/test/unit/cli-composer.test.ts`
  - `apps/agent-cli/test/unit/cli-commands.test.ts`
  - `apps/agent-cli/test/unit/cli-ui.test.ts`
  - `apps/agent-cli/test/unit/entrypoints/tui.test.ts`
