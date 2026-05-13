## Why

PRD-39 已完成 runtime 剩余边界总收口，学习沉淀也已经转为只维护 `operations/` 主线。此时继续做模块拆分收益很低，下一步应执行最终 release closeout：确认统一发布检查可用、文档入口与当前仓库状态一致、OpenSpec active changes 清空，并把最终验证证据沉淀到交接文档。

## What Changes

- 新增 PRD-40，作为最终发布收口记录。
- 更新根 README 的架构学习文档入口与 release check 说明。
- 更新 `apps/agent-cli/README.md` 中过期的绝对路径链接。
- 更新 PRD 路线图，补齐 PRD-21 到 PRD-40 的生产级架构阶段说明。
- 更新当前对话交接文档，记录最终 release closeout 验证状态。
- 执行 `pnpm release:check`、OpenSpec strict、active list 和 diff check。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `release-readiness-closeout`: 增加最终 release closeout 必须同步文档入口、执行统一发布检查、归档 change 并记录验证证据的要求。
- `architecture-learning-knowledge-base`: 明确学习沉淀主入口只维护 `operations/`，不再维护按 PRD 编号的学习流水账。

## Impact

- 影响文档：
  - `README.md`
  - `apps/agent-cli/README.md`
  - `prd/incremental/README.md`
  - `docs/当前对话交接-2026-05-13.md`
  - OpenSpec release / learning specs
- 影响验证：
  - 运行统一发布检查 `pnpm release:check`
  - 运行 OpenSpec strict、active list、diff check
- 不影响运行时代码。
