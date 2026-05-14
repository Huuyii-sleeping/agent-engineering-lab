## Why

当前 TUI palette 的结构已经接近 launcher，但 query 命中与选中项上下文仍需要用户自己扫读。继续推进产品化时，最直接的增益是增加命中高亮和 preview，让结果更像“可操作的选择器”，而不是命令清单。

## What Changes

- 新增 `PRD-54`，为 TUI palette 增加 query 命中高亮与 preview。
- palette 结果中的 query 命中采用本地文本高亮标记。
- command bar 增加当前选中项 preview 行。
- focused tests、build、OpenSpec strict、主规格同步。

## Capabilities

### Modified Capabilities

- `production-runtime-architecture`: 增补 TUI palette highlight / preview requirement。

## Impact

- 影响代码：
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - `apps/agent-cli/test/unit/entrypoints/tui.test.ts`
- 影响文档：
  - `prd/incremental/PRD-54-TUI-Palette高亮与预览.md`
  - `openspec/changes/prd-54-tui-palette-highlighting/*`
  - `openspec/specs/production-runtime-architecture/spec.md`
