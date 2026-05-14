## Why

当前本地 launcher 已经能打开 palette、浏览 transcript 和切换 session，但在高频使用下仍然存在三个产品缺口：palette 缺少稳定分组与更细提示，transcript 缺少连续导航，CLI / TUI 也没有统一的 workflow 切换入口。现在补齐这三块，可以让终端交互更接近完整的产品面，而不只是命令集合。

## What Changes

- 新增 `PRD-55`，收口 launcher 分组浏览、transcript 深度浏览和 workflow 切换。
- 为 CLI / TUI 增加 `/workflow agent|draw` 本地控制面。
- 为 palette 增加 workflow 候选、稳定分组显示和更细的本地键盘提示。
- 为 transcript 增加 `/history first|last`、`/search next|prev`、`/peek next|prev`。
- 同步更新 help、guide、footer、completion、TUI dashboard 和主规格。

## In Scope

- `/workflow`
- palette 分组与 workflow 入口
- transcript 连续导航
- CLI / TUI 文案与补全同步
- focused tests、build、OpenSpec strict

## Out of Scope

- 真正的图像生成执行链路
- 新的模型或 tool runtime 协议
- 富文本 palette renderer

## Capabilities

### New Capabilities

无

### Modified Capabilities

- `production-runtime-architecture`: 扩展本地 launcher、transcript 浏览和 workflow surface 的交互要求

## Impact

- 影响代码：
  - `apps/agent-cli/src/cli.ts`
  - `apps/agent-cli/src/cli-commands.ts`
  - `apps/agent-cli/src/cli-completion.ts`
  - `apps/agent-cli/src/cli-palette.ts`
  - `apps/agent-cli/src/cli-transcript.ts`
  - `apps/agent-cli/src/cli-ui.ts`
  - `apps/agent-cli/src/entrypoints/tui.ts`
- 影响测试：
  - `apps/agent-cli/test/unit/cli-commands.test.ts`
  - `apps/agent-cli/test/unit/cli-completion.test.ts`
  - `apps/agent-cli/test/unit/cli-palette.test.ts`
  - `apps/agent-cli/test/unit/cli-transcript.test.ts`
  - `apps/agent-cli/test/unit/cli-ui.test.ts`
  - `apps/agent-cli/test/unit/entrypoints/tui.test.ts`
- 影响文档：
  - `prd/incremental/PRD-55-Launcher分组浏览与Workflow切换.md`
  - `openspec/specs/production-runtime-architecture/spec.md`
