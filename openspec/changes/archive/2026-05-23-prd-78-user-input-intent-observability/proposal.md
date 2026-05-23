## Why

`06b-negative-keyword-analysis.md` 指出了用户输入中的负面反馈和继续执行意图可以作为产品诊断信号。本仓库已有本地 observability，但尚未把这类意图转成结构化、可回放、可治理的本地标签。

本次变更以最小闭环补齐输入意图标签：只记录分类结果，不改变 query 行为，不新增远端 telemetry。

## What Changes

- 新增用户输入意图分类 helper，识别负面反馈和继续执行两类信号。
- 在 query round 的 `loop_start` observability payload 中附加 `userInputIntent`。
- `userInputIntent` 只包含布尔标签、匹配类别和输入长度，不保存新的原始 prompt 副本。
- 增加单元测试和 smoke 测试验证分类、隐私边界和本地事件落盘。

### In Scope

- 负面反馈与继续执行意图的轻量关键词分类。
- 本地 observability 事件字段扩展。
- OpenSpec 规范与 PRD 记录。

### Out of Scope

- 不做 remote analytics / telemetry sink。
- 不做反馈问卷、transcript share 或训练上传。
- 不把分类结果用于安全阻断、prompt 改写或模型策略选择。
- 不引入外部依赖或机器学习分类器。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `observability-replay-debug`: query round 开始事件需要携带最小化的用户输入意图标签。

## Impact

- 影响代码：`apps/agent-cli/src/runtime/query-engine-round.ts`。
- 影响测试：`apps/agent-cli/test/unit/runtime/query-engine-round.test.ts`，新增 PRD-78 smoke 测试。
- 影响规范：`openspec/specs/observability-replay-debug/spec.md` 归档后应包含本地用户输入意图标签要求。
- 无 API 破坏性变更，无新增依赖。
