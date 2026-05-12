## Context

当前仓库已经完成第一轮生产级 runtime 收口：`QueryEngine`、`ToolService`、`DeliveryService`、`HookService`、`ObservabilityService`、`ModelPolicyService`、`MemoryService`、`NotificationService` 和 `RuntimeCoordinationService` 都已经显式化。

但除 `ToolService` 位于 `tools/service.ts` 外，其余应用级 runtime service 主要散落在 `apps/agent-cli/src/*-service.ts`。这让根目录继续承载过多运行时边界，也让核心装配文件不得不同时 import 多个具体 service 文件。

外部 Claude Code 源码的关键启发不是照搬目录名，而是稳定分层：`query` 管核心执行，`tools` 管工具协议与执行，`services` 管横切运行时能力，入口和 bootstrap 只负责装配。

## Goals

- 建立 `apps/agent-cli/src/services/` 作为应用级 runtime service 目录。
- 通过 `services/index.ts` 暴露稳定聚合导出。
- 让核心装配路径减少对根目录 service 文件的直接依赖。
- 保持运行语义和测试行为不变。

## Non-Goals

- 不把所有底层领域模块都塞进 `services/`。
- 不移动 `tools/service.ts`，因为它属于工具协议层内部 service，后续可单独评估。
- 不重写 `QueryEngine` 的 stage orchestration。
- 不改变默认实例生命周期。

## Decisions

### Decision 1: 迁移应用级 runtime service 到 `src/services/`

采纳：

- 将 `delivery-service.ts`、`hook-service.ts`、`memory-service.ts`、`model-policy-service.ts`、`notification-service.ts`、`observability-service.ts`、`runtime-coordination-service.ts` 移入 `src/services/`。
- 更新相对 import，保持导出的 class、type、默认实例命名不变。

备选方案：

- 仅新增 `services/index.ts` 重新导出根目录文件，不移动文件。

不采用原因：

- 这会继续保留根目录散乱形态，只是给它加一层 facade，不能真正校正目录边界。

### Decision 2: 保留 `ToolService` 在 `tools/service.ts`

采纳：

- `ToolService` 暂不迁移，因为它与 `tools/protocol.ts`、`tools/registry.ts`、具体 tool handler 属于同一工具协议层。
- `services/index.ts` 可以不重新导出 `ToolService`，避免把工具层内部边界混进应用级 service 目录。

备选方案：

- 把 `ToolService` 一并迁移到 `services/`。

不采用原因：

- 当前 tool service 既是 runtime dependency，也是 tools 子系统的门面；本轮强行迁移会扩大改动面，并模糊 `tools` 层职责。

### Decision 3: 保持兼容 wrapper，不新增根目录 shim

采纳：

- 直接更新仓库内 import 到新路径。
- 不额外保留根目录 `*-service.ts` 兼容 re-export，避免新旧路径并存。

备选方案：

- 保留旧路径文件做 re-export。

不采用原因：

- 当前包未承诺这些内部路径为外部 API；保留 shim 会延长迁移尾巴，并让后续边界继续不清晰。

## Risks

- 相对路径迁移容易漏 import。
- 测试中 mock 路径可能需要同步更新。
- 部分工具文件从 `tools/` 引用 service 后相对路径会变化。

## Verification

- `rg` 检查旧根目录 service import 已清空。
- 运行 focused unit tests：
  - `query-engine`
  - `query-runtime`
  - `query-preparation`
  - `query-model`
  - `query-tools`
  - `query-finalization`
  - `agent-service`
  - `bootstrap/app-runtime`
- 运行 `openspec validate prd-22-runtime-service-boundary-consolidation --strict`。
- 运行 `openspec validate --all --strict`。
