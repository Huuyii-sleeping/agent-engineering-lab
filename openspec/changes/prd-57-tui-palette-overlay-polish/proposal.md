## Why

当前 TUI palette 虽然已经具备 `Command Bar` 和结果浮层，但信息重复较多、块面偏重、提示语也过于说明书化。继续往“更像 launcher、但仍保持终端可读性”的方向推进时，最直接的一步是压缩 overlay 文案与结果密度，让用户更快扫到当前动作，而不是先消化一屏状态描述。

## What Changes

- 新增 `PRD-57`，聚焦 TUI palette overlay 的视觉与文案抛光。
- 收紧顶部 `Command Bar` 的信息层级，减少重复状态描述。
- 调整 `Palette Results` 的结果行结构，让命令与摘要更快扫读。
- 收口 palette 打开态的操作提示，保留必要键位但避免大段说明。
- focused tests、build、OpenSpec strict、主规格同步。

## In Scope

- TUI `Command Bar` 文案压缩
- TUI `Palette Results` 结果密度与行结构调整
- palette 打开态的精简操作提示
- focused tests、build、OpenSpec strict

## Out of Scope

- 新的 palette 命令或搜索语义
- CLI `/palette` 文本输出重做
- 图像生成执行链路
- 复杂颜色主题或动画效果

## Capabilities

### Modified Capabilities

- `production-runtime-architecture`: 增补 TUI palette overlay 更轻量、更紧凑的 launcher 要求。

## Impact

- 影响代码：
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - `apps/agent-cli/test/unit/entrypoints/tui.test.ts`
- 影响文档：
  - `prd/incremental/PRD-57-TUI-Palette浮层抛光.md`
  - `openspec/changes/prd-57-tui-palette-overlay-polish/*`
  - `openspec/specs/production-runtime-architecture/spec.md`
