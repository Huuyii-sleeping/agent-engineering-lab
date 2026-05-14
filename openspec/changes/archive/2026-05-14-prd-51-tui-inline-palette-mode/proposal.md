## Why

现在已经有本地 command palette，但还停留在“命令返回一段结果文本”的层级，距离 Claude Code 那种更直接的 TUI launcher 仍差一个本地模式面。这个差距主要不在能力，而在交互表面。

## What Changes

- 新增 `PRD-51`，把现有 palette 升级为 TUI 内的本地即时模式。
- 为 TUI dashboard 增加独立 Palette panel。
- `Ctrl+K` 支持打开/关闭本地 palette 模式。
- palette 打开时支持本地键盘导航和直接执行当前选中候选。
- palette 打开时，普通文本回车刷新 query，而不是进入模型请求链路。
- focused tests、build、OpenSpec strict、主规格同步。

## Capabilities

### Modified Capabilities

- `production-runtime-architecture`: 增补 TUI palette panel、键盘导航和本地选择执行 requirement。

## Impact

- 影响代码：
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - `apps/agent-cli/test/unit/entrypoints/tui.test.ts`
- 影响文档：
  - `prd/incremental/PRD-51-TUI即时Palette模式.md`
  - `openspec/changes/prd-51-tui-inline-palette-mode/*`
  - `openspec/specs/production-runtime-architecture/spec.md`
