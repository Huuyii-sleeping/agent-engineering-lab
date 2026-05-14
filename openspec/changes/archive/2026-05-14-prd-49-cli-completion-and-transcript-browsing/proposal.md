## Why

当前 CLI / TUI 已经有越来越完整的本地控制面，但用户仍然要手打命令，并且只能在 TUI 中被动看末尾几条 transcript。对一个日常使用的终端 Agent 来说，这会直接拉高输入成本，也让多轮会话难以回看、搜索和定位。

## What Changes

- 新增 `PRD-49`，补齐 CLI / TUI 的本地命令补全与 transcript 浏览控制面。
- 为交互 CLI 和 TUI 增加 `Tab` 补全，覆盖 slash command、本地 help topic、session selector、权限模式、主题、history 导航等高频参数。
- 增加 transcript 浏览命令：历史分页、搜索匹配、单条展开和返回 tail。
- 让 TUI Conversation panel 能展示 tail / history / search / peek 等本地浏览状态，而不只固定显示最近几条消息。
- 同步 help、guide、footer、focused tests、build 与 OpenSpec strict。
- In Scope：交互 CLI / TUI 的本地补全、transcript 浏览命令、TUI 浏览面、规格同步。
- Out of Scope：自然语言补全、模型侧检索增强、完整 fuzzy palette、Web transcript viewer。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `production-runtime-architecture`: 补充 CLI / TUI 命令补全和 transcript 浏览 requirement。

## Impact

- 影响代码：
  - `apps/agent-cli/src/cli.ts`
  - `apps/agent-cli/src/cli-commands.ts`
  - `apps/agent-cli/src/cli-ui.ts`
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - 新增本地 completion / transcript browser helper
  - 新增或更新对应单测
- 影响文档：
  - 新增 `prd/incremental/PRD-49-CLI补全与Transcript浏览.md`
  - 新增 OpenSpec change 及 delta spec
  - 更新 `openspec/specs/production-runtime-architecture/spec.md`
