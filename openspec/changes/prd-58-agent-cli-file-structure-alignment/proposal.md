## Why

当前 `apps/agent-cli/src/` 根目录里同时混着 CLI 交互表面、runtime、tools、delivery、config 等多类文件，尤其 `cli-*` 系列已经形成一组稳定子系统，却仍散落在根层。继续迭代本地控制面时，这会抬高阅读和修改成本，也会弱化已经建立起来的分层边界。

## What Changes

- 新增 `PRD-58`，收拢 `agent-cli` 中的 CLI 交互模块目录结构。
- 建立专门的 `src/cli/` 子目录，承接交互 CLI / TUI 共用的本地控制面模块。
- 迁移现有 `cli.ts`、`cli-commands.ts`、`cli-ui.ts`、`cli-palette.ts` 等 CLI 相关实现到该子目录。
- 更新 entrypoints、runtime、tools 和测试中的 import 路径，保持行为不变。
- 同步 README、学习沉淀和主规格中的目录边界说明。

## In Scope

- `src/cli/` 目录建立与 CLI 相关文件迁移
- import 路径更新
- focused tests、build、OpenSpec strict
- 文档和沉淀同步

## Out of Scope

- Query runtime、tools、services 的行为调整
- CLI / TUI 命令语义变更
- test 目录的大规模重组
- 继续扩展新的本地控制面能力

## Capabilities

### Modified Capabilities

- `production-runtime-architecture`: 增补 CLI 本地交互模块必须有独立目录边界的要求。

## Impact

- 影响代码：
  - `apps/agent-cli/src/cli*.ts`
  - `apps/agent-cli/src/entrypoints/*.ts`
  - `apps/agent-cli/src/runtime/query-tool-executor.ts`
  - `apps/agent-cli/src/tools/security.ts`
- 影响测试：
  - `apps/agent-cli/test/unit/cli*.test.ts`
  - `apps/agent-cli/test/unit/entrypoints/*.test.ts`
- 影响文档：
  - `apps/agent-cli/README.md`
  - `docs/learning/claude-code/operations/*`
  - `openspec/specs/production-runtime-architecture/spec.md`
