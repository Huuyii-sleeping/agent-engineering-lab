## Why

`11-hidden-features-and-easter-eggs.md` 强调隐藏命令、内部彩蛋、feature flag 和 beta-only surface 需要明确治理。本仓库已有多个本地控制面，但缺少统一 feature disclosure 清单来声明哪些能力是公开入口、哪些隐藏/实验面不存在或仍是 reserved gap。

本次变更不新增隐藏功能，而是让本地功能面可审计、可发现，避免能力长期散落在代码中。

## What Changes

- 新增 CLI feature disclosure registry，集中描述本地功能面、可见性、稳定性和入口命令。
- 新增 `/features` 本地命令，渲染功能披露清单。
- 将 `/features` 加入 `/help`、`/help runtime` 和 command palette。
- 增加测试验证当前没有启用的隐藏命令或隐藏彩蛋。

### In Scope

- 本地 CLI / TUI 控制面功能披露。
- hidden/easter/beta-only surface 的 reserved gap 标记。
- 单元测试和 smoke 测试覆盖。

### Out of Scope

- 不实现真实隐藏命令或彩蛋。
- 不实现远端 feature flag service、beta header 或实验分流。
- 不改变现有命令行为、权限策略或 palette 执行语义。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: CLI/TUI 本地交互面必须提供功能披露治理，避免隐藏能力不可审计。

## Impact

- 影响代码：`apps/agent-cli/src/cli/features.ts`、`apps/agent-cli/src/cli/ui.ts`、`apps/agent-cli/src/cli/commands.ts`、`apps/agent-cli/src/cli/palette.ts`。
- 影响测试：CLI feature registry、UI、command、palette 单元测试和 PRD-79 smoke。
- 影响规范：`openspec/specs/production-runtime-architecture/spec.md` 归档后应包含 feature disclosure 要求。
- 无 API 破坏性变更，无新增依赖。
