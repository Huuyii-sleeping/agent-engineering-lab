## Why

PRD-91/95 已经建立 test-only harness 基础层和生产 `QueryEngine` runner，但目前核心场景仍主要散落在单元测试中，缺少一个可独立列举、筛选和运行的本地 harness 场景矩阵入口。继续完善 agent 基础能力前，需要先把 harness 从“测试辅助函数”提升为可作为本地生产级验收门禁的稳定执行面。

## What Changes

In Scope:

- 新增本地 harness scenario matrix runner，用统一注册表管理核心 production agent loop 场景。
- 支持列举场景、按名称筛选运行、返回结构化结果和可读文本摘要。
- 将现有 production harness golden 场景沉淀为可复用矩阵定义，避免只存在于单个单测文件中。
- 更新 `test:harness` 脚本，使其运行 harness 自测和本地场景矩阵门禁。
- 补充 OpenSpec 规范，明确 harness 场景矩阵必须可独立执行且不访问真实网络。

Out of Scope:

- 不实现远端评测平台、CI dashboard 或历史趋势数据库。
- 不引入真实模型调用或外部服务依赖。
- 不重写现有 `runHarnessAgentScenario` 核心 runner。
- 不把所有 smoke / regression 脚本迁移到 harness matrix。

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-cli-test-harness`: 增加本地 harness 场景矩阵 runner 的可列举、可筛选、可独立执行与结果汇总要求。

## Impact

- 影响测试 harness：`apps/agent-cli/test/harness/**`。
- 影响 harness 单元测试：`apps/agent-cli/test/unit/harness/**`。
- 影响包脚本：`apps/agent-cli/package.json` 的 `test:harness`。
- 影响规格：`openspec/specs/agent-cli-test-harness/spec.md`。
- 不新增运行时依赖，不改变生产 CLI / service / daemon 行为。
