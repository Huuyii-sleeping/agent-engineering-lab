## Why

当前 TUI palette 已有独立 panel，但 query 仍然依赖回车提交，交互节奏还是偏“命令式”。如果要继续往 Claude Code 那种更自然的 launcher 体验推进，下一步最有价值的是把 query 改成实时本地过滤，并把回车专门留给“执行当前选中项”。

## What Changes

- 新增 `PRD-52`，为 TUI palette 增加实时本地过滤。
- palette 打开时，字符输入和 `backspace/delete` 即时刷新 query。
- palette 打开时，`Enter` 直接执行当前选中候选。
- focused tests、build、OpenSpec strict、主规格同步。

## Capabilities

### Modified Capabilities

- `production-runtime-architecture`: 增补 TUI palette live filtering requirement。

## Impact

- 影响代码：
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - `apps/agent-cli/test/unit/entrypoints/tui.test.ts`
- 影响文档：
  - `prd/incremental/PRD-52-TUI实时Palette过滤.md`
  - `openspec/changes/prd-52-tui-live-palette-filtering/*`
  - `openspec/specs/production-runtime-architecture/spec.md`
