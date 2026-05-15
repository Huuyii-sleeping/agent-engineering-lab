## Context

`agent-cli` 当前已经按 `runtime/`、`tools/`、`services/`、`prompt/`、`memory/` 等目录逐步显式化边界，但 CLI 本地控制面仍然是一个例外：`cli.ts`、`cli-commands.ts`、`cli-ui.ts`、`cli-palette.ts`、`cli-transcript.ts`、`cli-permissions.ts` 等文件散在 `src/` 根目录，与真正的应用根层文件混在一起。

这会带来两个问题：

- 维护者在阅读根目录时，很难一眼区分“应用级入口/装配文件”和“CLI 表面内部模块”；
- CLI / TUI 的继续产品化会持续增加 `cli-*` 文件，根目录会越来越像平铺的功能清单。

这次变更是目录边界校正，不改命令语义和运行时行为。

## Goals / Non-Goals

**Goals:**

- 为 CLI 本地交互模块建立专门的 `src/cli/` 子目录。
- 让 `src/` 根目录更多保留应用级入口、组合根和跨表面共享模块。
- 保持 CLI、TUI、headless、runtime、tools 和测试行为兼容。

**Non-Goals:**

- 不改 slash command、palette、workflow、prompt inspection 的语义。
- 不重组 `runtime/`、`tools/`、`services/` 目录。
- 不大规模重排 `test/unit` 目录结构。

## Decisions

### Decision 1: 把 CLI 相关文件整体迁移到 `src/cli/`，而不是只新建 barrel 再维持旧文件位置

采纳：

- 建立 `src/cli/`。
- 迁移 `cli.ts`、`cli-commands.ts`、`cli-completion.ts`、`cli-composer.ts`、`cli-doctor.ts`、`cli-palette.ts`、`cli-permissions.ts`、`cli-shell.ts`、`cli-transcript.ts`、`cli-ui.ts`、`cli-workflow.ts`。

原因：

- 目标是结构收拢，而不只是增加一个新的导出层。
- 保留旧位置会让根目录继续显得拥挤，也会留下双重入口。

备选方案：

- 只新增 `src/cli/index.ts`，旧文件继续留在根目录。

不采用原因：

- 这只改善导出，不改善目录认知负担。

### Decision 2: 根层入口与其他模块直接改用新路径，不保留兼容 wrapper 文件

采纳：

- `entrypoints/`、`runtime/`、`tools/` 以及测试直接改用 `src/cli/*` 新路径。

原因：

- wrapper 文件会延长过渡期，并让真实归属再次变得模糊。
- 这次改动虽然跨文件多，但语义简单，适合一次性收口。

备选方案：

- 在旧路径保留转发文件，逐步迁移调用方。

不采用原因：

- 会制造长期的重复路径和不必要的过渡层。

### Decision 3: 这次只收 CLI 子系统，不顺手重排 test 目录

采纳：

- 测试文件位置保持不变，只更新 import。

原因：

- 用户这次关注点是 `agent-cli` 源码结构，test 目录不是主要矛盾。
- 如果同时重排 `test/unit`，会扩大 diff 和验证面。

备选方案：

- 同步把 `test/unit/cli*.test.ts` 收到 `test/unit/cli/`。

不采用原因：

- 会把一次“源目录边界校正”升级成双目录树重构，不利于快速验证。

## Risks / Trade-offs

- [Risk] 大量 import 路径调整容易漏改
  - Mitigation：用 focused tests 覆盖 CLI、TUI、dispatcher、palette、help、completion 等高频路径，并运行 build

- [Risk] 当前工作树已有未提交的 CLI 改动，目录迁移时更容易冲突
  - Mitigation：逐文件 move 并在迁移时保留现有内容，不回退已有修改

- [Risk] 只收源目录、不收测试目录，结构仍不算完全对称
  - Mitigation：把本轮范围控制在源目录主矛盾，后续如需要再做 test tree 对齐

## Migration Plan

1. 先补 proposal / design / spec / tasks，明确这是目录边界收拢，不是行为改动。
2. 建立 `src/cli/` 并迁移 CLI 相关文件。
3. 更新 `entrypoints/`、`runtime/`、`tools/` 与 tests 的 import。
4. 运行 focused tests、TypeScript build 和 OpenSpec strict。
5. 同步 README 与学习沉淀中的目录说明。

本次变更不涉及数据迁移。若需回退，只需回退文件移动和 import 更新。

## Open Questions

- 后续是否要把 `test/unit/cli*.test.ts` 也收拢到 `test/unit/cli/`。
- 是否要在下一轮继续把 TUI 特有逻辑从 `entrypoints/tui.ts` 中下沉到 `src/cli/tui-*` 子模块。
