## Why

当前仓库已经完成 `PRD-00` 到 `PRD-19` 的主能力实现，但发布门禁与归档规格收口还没有同步跟上。结果是：一方面 `release:check` 没有覆盖全部后期 smoke，另一方面多个归档 spec 仍保留 `Purpose TBD` 占位文本，导致“代码已完成、规范未收口”的状态持续存在。

PRD-20 的目标不是新增运行时能力，而是补齐发布前最后一层工程约束：让仓库存在一个可信的统一发布检查入口，并确保归档后的规格文档不再保留未完成占位。

## What Changes

- 新增一个仓库级发布收口能力，定义统一 `release:check` 必须覆盖当前已实现的后期 smoke / 回归入口。
- 规定归档后的 OpenSpec 正式规格不得继续保留 `Purpose TBD` 之类的占位文本，必须写成可读、可维护的正式目的说明。
- 更新 `apps/agent-cli` 的发布检查脚本，使其覆盖当前已落地的关键验证项。
- 收口现有 `openspec/specs/` 中遗留的占位 `Purpose` 内容。

In Scope:
- `apps/agent-cli/package.json` 中统一发布检查脚本的补齐
- `openspec/specs/` 下已归档正式 spec 的 `Purpose` 补写
- 与上述变更直接相关的文档或测试调整

Out of Scope:
- 新增新的运行时工具、CLI 指令或 HTTP API
- 重写既有 smoke 的业务逻辑
- 调整 PRD-00 到 PRD-19 的功能范围或验收边界

## Capabilities

### New Capabilities

- `release-readiness-closeout`: 定义仓库统一发布检查覆盖范围，以及归档正式规格的最小收口要求。

### Modified Capabilities

- None.

## Impact

- 影响代码：
  - `apps/agent-cli/package.json`
- 影响文档：
  - `openspec/specs/**/spec.md`
  - 视情况补充 `README.md` 或相关使用说明
- 影响验证：
  - 统一发布检查命令将覆盖更多已实现能力的 smoke / 回归测试
