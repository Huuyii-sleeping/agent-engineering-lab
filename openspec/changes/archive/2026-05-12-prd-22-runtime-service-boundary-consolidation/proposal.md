## Why

PRD-21 已经把 `QueryEngine` 和一组 runtime service 显式化，但这些 service 仍分散在 `apps/agent-cli/src/` 根目录。随着 CLI、HTTP service 和未来 Web 都要复用同一套 runtime，继续让调用方直接依赖一组根目录 service 文件，会让装配边界变得松散，也不利于后续继续对齐外部源码的 `services` 分层。

这一轮需要先做边界校正：不扩功能，不重写 query 算法，而是把已存在的应用级 runtime service 收进稳定目录与聚合导出入口。

## What Changes

- 新增 `apps/agent-cli/src/services/` 作为应用级 runtime service 的统一目录。
- 迁移当前已显式化的 service 文件，并保留原有默认实例、`Like` 类型和调用契约。
- 新增 service 聚合导出入口，让 `bootstrap`、`runtime`、`agent-service` 等核心装配路径通过统一边界引用 service。
- 更新相关 import、测试和学习沉淀文档。
- 不改变 CLI、HTTP API、工具 schema、模型策略或 query loop 运行语义。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加 runtime service 需要稳定目录与聚合导出边界的架构要求。
- `architecture-learning-knowledge-base`: 增加每轮架构边界校正必须同步沉淀“差距分析与采纳状态”的要求。

## Impact

- 影响代码：
  - `apps/agent-cli/src/bootstrap/app-runtime.ts`
  - `apps/agent-cli/src/runtime/query-engine.ts`
  - `apps/agent-cli/src/runtime/query-*.ts`
  - `apps/agent-cli/src/agent-service.ts`
  - `apps/agent-cli/src/agent-loop.ts`
  - 相关 tool、subagent 与 unit test import
- 影响文档：
  - 新增 `PRD-22`
  - 新增 OpenSpec change
  - 新增一篇 `docs/learning/claude-code/` 学习沉淀
- 不引入新外部依赖，不改变用户可见 API。
