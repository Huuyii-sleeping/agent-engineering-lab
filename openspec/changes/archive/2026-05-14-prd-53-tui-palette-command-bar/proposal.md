## Why

当前 TUI palette 已经具备实时过滤和本地执行能力，但视觉组织仍偏“页面内面板”。如果继续向 Claude Code 的 launcher 靠拢，下一步应该把它收束成更紧凑的顶部 command bar 和结果浮层，而不是继续占用主会话区。

## What Changes

- 新增 `PRD-53`，将 TUI palette 重构为 command bar + overlay-style results。
- palette 打开时显示顶部 `Command Bar`。
- palette 结果改为居中的紧凑浮层块。
- 恢复 Conversation 区的稳定高度。
- focused tests、build、OpenSpec strict、主规格同步。

## Capabilities

### Modified Capabilities

- `production-runtime-architecture`: 增补 TUI palette compact command bar / overlay surface requirement。

## Impact

- 影响代码：
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - `apps/agent-cli/test/unit/entrypoints/tui.test.ts`
- 影响文档：
  - `prd/incremental/PRD-53-TUI-Palette浮层命令栏.md`
  - `openspec/changes/prd-53-tui-palette-command-bar/*`
  - `openspec/specs/production-runtime-architecture/spec.md`
