## Why

PRD-22 已经把应用级 runtime service 收进 `src/services/`，但 `QueryEngine` 和 `createAgentAppRuntime` 仍以一组散开的 service 字段描述依赖。随着 service 数量继续增长，这种形态会让构造函数、测试 fake 和未来入口接入持续变宽。

这一轮把这些横切依赖收成 `RuntimeServices` 对象，不改行为，只校正依赖形态。

## What Changes

- 新增 runtime services 依赖包类型和默认创建函数。
- 让 `QueryEngine` 通过 `runtimeServices` 对象访问横切 service。
- 保持 `createAgentAppRuntime` 的单项 override 能力，避免测试调用方必须构造完整依赖包。
- 更新 focused tests 和学习沉淀文档。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加 query runtime 的横切 service 依赖需要可作为稳定依赖包装配的要求。
- `architecture-learning-knowledge-base`: 继续要求本轮边界校正沉淀中文学习文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/services/`
  - `apps/agent-cli/src/bootstrap/app-runtime.ts`
  - `apps/agent-cli/src/runtime/query-engine.ts`
  - 相关 unit tests
- 影响文档：
  - 新增 `PRD-23`
  - 新增 OpenSpec change
  - 新增 `docs/learning/claude-code/` 学习沉淀
- 不改变 CLI、HTTP service、工具 schema、模型策略或用户可见行为。
