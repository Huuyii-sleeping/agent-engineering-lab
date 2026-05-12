# PRD-22 运行时服务目录与边界校正

## 目标

沿着 PRD-21 已经建立的生产级架构主线，继续对齐 Claude Code `src/` 中 `query / tools / services / state` 等稳定分层，把当前已经显式化但仍散落在 `apps/agent-cli/src/` 根目录的 runtime service 收拢到明确目录与导出边界中。

本阶段重点不是新增功能，而是让 `QueryEngine` 周围的依赖图更接近可长期维护的生产形态：调用方通过统一 service 边界装配和引用能力，兼容入口保留，但不继续扩大根目录级 service 文件。

## 范围（In Scope）

- 建立 `apps/agent-cli/src/services/` 作为应用级 runtime service 的统一目录。
- 迁移当前已显式化的 service：
  - `DeliveryService`
  - `HookService`
  - `MemoryService`
  - `ModelPolicyService`
  - `NotificationService`
  - `ObservabilityService`
  - `RuntimeCoordinationService`
- 提供稳定聚合导出入口，减少 `bootstrap`、`runtime`、`agent-service` 对零散根目录 service 文件的直接依赖。
- 更新相关 import、测试和学习沉淀文档。
- 保留现有运行语义、默认实例和兼容 wrapper 行为。

## 非目标（Out of Scope）

- 不重写 `QueryEngine` 的执行算法。
- 不改变 tool schema、HTTP API、CLI 交互协议或模型策略规则。
- 不迁移底层领域模块目录，例如 `memory/`、`observability/`、`hooks/`、`tools/` 内部实现。
- 不开始 Web 展示接入。

## 功能要求

- 应用级 runtime service 必须具有统一目录与聚合导出边界。
- `bootstrap/app-runtime.ts` 和 `runtime/query-engine.ts` 应主要依赖 service 聚合入口，而不是继续引用多个根目录 service 文件。
- 迁移后所有既有默认 service 实例、`Like` 类型和调用契约必须保持兼容。
- 本轮必须同步更新学习沉淀文档，说明为什么现在收目录边界、采纳了什么、暂不采纳什么。

## 验收标准（AC）

- AC-22-1：`apps/agent-cli/src/services/` 中存在本轮 runtime service 的稳定导出入口。
- AC-22-2：`bootstrap/app-runtime.ts`、`runtime/query-engine.ts` 等核心装配路径通过统一 service 边界引用依赖。
- AC-22-3：迁移不改变 CLI、HTTP service、tool execution、delivery、hook、observability、memory、model policy 和 notification 的既有行为。
- AC-22-4：相关单元测试和 OpenSpec 校验通过。
- AC-22-5：新增中文学习沉淀文档，记录本轮边界校正结论。

## 实施顺序

1. 补齐 PRD 与 OpenSpec artifacts。
2. 建立 `services/` 目录和聚合导出入口。
3. 迁移 service 文件并更新 import。
4. 运行 focused unit tests 与 OpenSpec validate。
5. 更新学习沉淀文档并收尾任务状态。
