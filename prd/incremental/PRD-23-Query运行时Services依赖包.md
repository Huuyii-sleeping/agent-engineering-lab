# PRD-23 Query 运行时 Services 依赖包

## 目标

在 PRD-22 已经建立 `apps/agent-cli/src/services/` 目录后，继续收敛 `QueryEngine` 的依赖形态，把散开的 runtime service 参数组合成一个明确的 `RuntimeServices` 对象。

本阶段不改变任何运行语义，只把“QueryEngine 需要哪些横切 service”从构造函数字段列表提升成可复用依赖包，方便 CLI、HTTP service、未来 Web 和测试共享同一套服务装配形态。

## 范围（In Scope）

- 新增 `RuntimeServices` / `RuntimeServiceOverrides` 类型。
- 新增创建默认 runtime services 的工厂函数。
- 让 `bootstrap/app-runtime.ts` 通过该依赖包装配 service。
- 让 `QueryEngine` 持有一个 `runtimeServices` 对象，而不是一组散开的 service 字段。
- 更新相关测试和学习沉淀文档。

## 非目标（Out of Scope）

- 不迁移 `ToolService` 到 `services/`。
- 不改变 tool registry、tool protocol 或工具执行行为。
- 不重写 query stages。
- 不改变 CLI、HTTP API、模型策略或默认实例生命周期。
- 不开始 Web 展示接入。

## 功能要求

- `QueryEngine` 的横切 runtime service 依赖必须可以作为一个稳定对象传入。
- `createAgentAppRuntime` 仍支持按单个 service override，避免测试和现有调用方被迫构造完整对象。
- 默认 service 实例保持与 PRD-22 后一致。
- 本轮必须新增中文学习沉淀文档，说明为何先收 `RuntimeServices`，以及为何暂不动 `ToolService`。

## 验收标准（AC）

- AC-23-1：`apps/agent-cli/src/services/` 中存在 runtime services 依赖包定义与默认创建入口。
- AC-23-2：`QueryEngine` 内部通过 `runtimeServices` 访问 delivery、hook、memory、model policy、notification、observability、runtime coordination 等 service。
- AC-23-3：`createAgentAppRuntime` 对外仍暴露现有单 service override 能力。
- AC-23-4：focused unit tests、build 和 OpenSpec strict 校验通过。
- AC-23-5：新增中文学习沉淀文档。

## 实施顺序

1. 建立 PRD 与 OpenSpec change。
2. 新增 runtime services 类型与工厂。
3. 更新 `createAgentAppRuntime` 和 `QueryEngine`。
4. 更新测试与学习文档。
5. 运行验证并归档 change。
