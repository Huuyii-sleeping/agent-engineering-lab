## Why

当前 CLI / TUI 已经补齐了会话切换、composer 和基础快捷键，但“怎么发现这些能力”仍然偏原型：`/help` 还是一整页平铺命令，TUI 左侧 `Controls` 也在持续变长。和成熟终端产品相比，差距已经不在功能缺失，而在帮助分层、上下文化引导和控制面的信息架构。

## What Changes

- 新增 `PRD-48`，把终端控制面的重点从“继续加命令”转到“让已有命令更容易被发现和使用”。
- 为 `/help` 增加 topic-based 帮助：支持按 `draft`、`sessions`、`runtime`、`approvals` 等主题查看分层指引，而不是只给一份扁平总表。
- 重构 TUI 左侧控制面：用更紧凑的 `Guide` / `Shortcuts` 视图替代无限增长的静态命令墙，并根据当前状态给出上下文化提示。
- 为 TUI 增加专用 help 快捷入口，让用户在不离开当前会话的情况下快速调出帮助。
- 同步 `production-runtime-architecture` 规格、focused tests、build 与 OpenSpec strict 校验。
- In Scope：帮助分层、TUI guide 文案、快捷入口、测试与规格同步。
- Out of Scope：完整命令补全、复杂焦点系统、React/Ink 重做、Web Console。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `production-runtime-architecture`: 补充 CLI / TUI 的分层帮助、上下文化 guide 与 help 快捷入口 requirement。

## Impact

- 影响代码：
  - `apps/agent-cli/src/cli-ui.ts`
  - `apps/agent-cli/src/cli-commands.ts`
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - `apps/agent-cli/test/unit/cli-ui.test.ts`
  - `apps/agent-cli/test/unit/cli-commands.test.ts`
  - `apps/agent-cli/test/unit/entrypoints/tui.test.ts`
- 影响文档：
  - 新增 `prd/incremental/PRD-48-TUI命令发现与帮助视图抛光.md`
  - 新增 OpenSpec change 及 delta spec
  - 更新 `openspec/specs/production-runtime-architecture/spec.md`
