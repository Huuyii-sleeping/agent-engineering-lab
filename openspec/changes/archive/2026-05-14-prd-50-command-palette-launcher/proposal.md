## Why

现在 CLI / TUI 已经有 help、Tab 补全和 transcript 浏览，但高频本地动作仍然主要依赖“先想起命令，再完整输入”。这说明终端控制面已经不缺功能，而是缺一个统一的本地 action launcher，把命令发现和命令执行收成同一个入口。

## What Changes

- 新增 `PRD-50`，为 CLI / TUI 增加本地 command palette / fuzzy launcher。
- 新增 `/palette` 命令，用于展示高频本地动作候选。
- 支持 `/palette <query>` 进行本地模糊搜索，覆盖 help topic、session 切换、transcript 浏览和 runtime 控制动作。
- 支持 `/palette open <index>` 执行最近一次 palette 结果中的某个候选，而不要求用户再次完整输入命令。
- 为 TUI 增加 `Ctrl+K` palette 快捷入口，并同步 help / guide / footer 文案。
- 同步 focused tests、build、OpenSpec strict 与主规格。
- In Scope：palette 数据模型、本地 fuzzy search、候选执行、`Ctrl+K`、文案与测试同步。
- Out of Scope：模型生成式 action 推荐、跨 session 全局历史排名、React/Ink 弹窗式 palette、Web command launcher。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `production-runtime-architecture`: 补充 CLI / TUI command palette 与本地 launcher requirement。

## Impact

- 影响代码：
  - `apps/agent-cli/src/cli-commands.ts`
  - `apps/agent-cli/src/cli-ui.ts`
  - `apps/agent-cli/src/cli-completion.ts`
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - 新增 `cli-palette` helper / state
  - 对应 focused tests
- 影响文档：
  - 新增 `prd/incremental/PRD-50-CommandPalette本地启动器.md`
  - 新增 OpenSpec change 及 delta spec
  - 更新 `openspec/specs/production-runtime-architecture/spec.md`
