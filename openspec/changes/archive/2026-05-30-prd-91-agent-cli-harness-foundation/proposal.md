## Why

`agent-cli` 的能力已经覆盖 CLI、Ink TUI、scheduler、multi-agent、session resume、memory、delivery 等关键链路，但验证代码仍以分散 smoke 和局部单测为主。需要先建立统一 harness 基础层，让后续功能可以通过结构化场景、确定性模型响应和临时 workspace fixture 主动发现问题。

## What Changes

- 新增 test-only harness 基础目录，提供 workspace fixture、deterministic model 和 scenario runner。
- 新增 harness 自测，覆盖文件准备、环境恢复、模型脚本响应、故障注入和断言结果。
- 新增 `test:harness` 脚本，作为后续 harness 增强的独立入口。
- 不改变 production runtime 行为，不引入远端功能或新增依赖。

## Capabilities

### New Capabilities

- `agent-cli-test-harness`: 定义本地测试 harness 的基础能力，包括可重复 workspace fixture、确定性模型响应和结构化场景 runner。

### Modified Capabilities

- 无。

## Impact

- 影响测试目录：`apps/agent-cli/test/harness/**`、`apps/agent-cli/test/unit/harness/**`。
- 影响脚本：`apps/agent-cli/package.json` 增加 `test:harness`。
- 影响规格：新增 `openspec/specs/agent-cli-test-harness/spec.md`。
