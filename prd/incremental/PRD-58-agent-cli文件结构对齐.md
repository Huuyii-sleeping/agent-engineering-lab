# PRD-58 agent-cli 文件结构对齐

## 背景

`apps/agent-cli/src/` 目前已经有 `runtime/`、`tools/`、`services/`、`prompt/`、`memory/` 等稳定目录，但 CLI 本地交互表面仍然是例外：大量 `cli-*` 文件散落在根目录，和应用级入口、组合根、共享模块混在一起，读起来不够整洁。

## 目标

- 把 CLI 相关实现收拢到专门的 `src/cli/` 子目录。
- 让根目录更多保留应用级入口和跨表面共享模块。
- 保持 CLI / TUI / headless / runtime / tests 行为不变。

## In Scope

- 建立 `apps/agent-cli/src/cli/`
- 迁移 `cli.ts`、`cli-commands.ts`、`cli-ui.ts`、`cli-palette.ts` 等 CLI 相关文件
- 更新 import 路径
- 更新 README、学习沉淀和规格说明
- focused tests、build、OpenSpec strict

## Out of Scope

- CLI / TUI 命令语义调整
- runtime、tools、services 目录重组
- test 目录的大规模重排

## 验收标准

- `apps/agent-cli/src/cli/` 成为 CLI 本地交互实现的稳定目录。
- `entrypoints/`、`runtime/`、`tools/` 和 tests 改用新的 `cli/` 路径。
- 目录调整后不改变现有命令、palette、workflow、prompt、approval 等行为。
- focused tests、build、OpenSpec strict 通过。
