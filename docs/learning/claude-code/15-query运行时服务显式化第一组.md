# 第十五轮学习沉淀：Query 运行时服务显式化第一组

## 这组改造真正学到的东西

### 1. `QueryEngine` 显式化之后，真正要继续收的不是函数段，而是围绕它的一圈核心依赖

把 `QueryEngine` 立出来之后，主路径里最明显的剩余问题已经不是“代码太长”，而是依赖还散在各处：

- 工具发现和执行还没有正式 service
- auto delivery 还是全局函数入口
- hooks 横跨多个 stage，但没有统一注入点
- observability 横跨多个 stage，也没有统一注入点
- model policy 是 runtime 的预算与模型选择能力，但也还不是正式 service
- memory 注入和 memory tools 已经有底层实现，但应用运行时层还没有正式 service 边界

如果这些还继续停留在“模块函数 + 到处 import”的形态，那 `QueryEngine` 只是名义上显式化，运行时边界并没有真正站稳。

### 2. 这一组改造的核心，不是多造几个类，而是把 query runtime 从“函数拼接”推进到“显式装配”

这一组最终收下来的 service 是：

- `ToolService`
- `DeliveryService`
- `HookService`
- `ObservabilityService`
- `ModelPolicyService`
- `MemoryService`

它们分别解决的是四类不同的运行时依赖：

- `ToolService`
  - 工具发现、registration、metadata、preview、执行
- `DeliveryService`
  - delivery report、validation、tool-facing delivery 能力
- `HookService`
  - prompt / session / tool / stop 各类 hook 调用边界
- `ObservabilityService`
  - trace、span、execution context、runtime telemetry
- `ModelPolicyService`
  - model selection、fallback selection、usage finalize
- `MemoryService`
  - auto extract、query memory injection、memory tool-facing add/search/list

这样之后，app runtime 才真正开始像 composition root，而不是一组零散 helper 的聚合点。

### 3. 这组 service 改造还有一个很实际的收益：测试边界终于开始和生产边界对齐

这一组改造之后，很多 runtime 单测都从：

- `vi.mock("某个全局模块")`

逐步转向：

- 注入 fake `toolService`
- 注入 fake `deliveryService`
- 注入 fake `hookService`
- 注入 fake `observabilityService`
- 注入 fake `modelPolicyService`
- 注入 fake `memoryService`

这件事的价值非常直接：

- 测试更贴近真实依赖图
- 模块路径变化不会导致大量 mock 跟着漂移
- runtime 主路径的 service 边界是否合理，可以通过测试结构直接看出来

## 这组改造怎么映射到本仓库

### 原来的共同问题

- `QueryEngine` 周围依赖面太散
- 多个 query stage 直接依赖全局模块函数
- app runtime / CLI / HTTP service / shared runtime 没有真正共享一套稳定依赖注入面
- 虽然代码已经开始分层，但主路径还不够“以 service 为单位”组织

### 这组实际做的事

1. 新增 `tools/service.ts`
2. 新增 `delivery-service.ts`
3. 新增 `hook-service.ts`
4. 新增 `observability-service.ts`
5. 新增 `model-policy-service.ts`
6. 新增 `memory-service.ts`
7. 让 `bootstrap/app-runtime.ts` 把这些 service 都纳入共享装配
8. 让 `agent-loop.ts` 保留 compatibility wrapper，但补齐默认 service
9. 让 `AgentService` 透传这些共享 runtime service
10. 让 `QueryEngine` 显式持有这些 service
11. 让 `query-runtime / query-preparation / query-model / query-tools / query-finalization / query-notifications` 改走这些 service
12. 让 subagent 的 model policy 调用也开始走默认 `ModelPolicyService`
13. 让 query preparation 与 base memory tools 开始走 `MemoryService`
14. 把相关 unit test / smoke test 改成基于 service 注入验证

## 这一组里每个 service 分别解决了什么

### `ToolService`

解决的问题：

- 主路径还在手工拼工具依赖
- `QueryEngine` 还要等外部先准备工具 schema
- query tool stage 还在直接依赖工具函数

落地后：

- 工具发现、metadata、preview、执行开始进入统一 service
- `tools/index.ts` 退回默认 service 的薄包装
- query 主路径开始面向正式工具 service

### `DeliveryService`

解决的问题：

- `query-finalization` 直接调用 delivery 模块函数
- base tools 里的 delivery 能力也还是全局函数入口

落地后：

- auto delivery 改为通过 `deliveryService` 注入
- delivery tool handler 改走默认 `DeliveryService`
- query 和 tools 对 delivery 的依赖开始收口到同一层

### `HookService`

解决的问题：

- `query-runtime / query-preparation / query-tools / query-finalization` 都直接调用 `runHooks`
- hook 是横切依赖，但没有统一注入边界

落地后：

- prompt / session / tool / stop hooks 全部改走 `hookService`
- query stages 不再各自直连 hook 模块
- hook 调用开始进入共享 runtime service 依赖面

### `ObservabilityService`

解决的问题：

- query 主路径各 stage 到处直接依赖 observability runtime
- trace / span / telemetry / execution context 是横切能力，但还不是正式 service

落地后：

- `query-engine / query-model / query-tools / query-notifications` 开始通过 `observabilityService` 交互
- query 侧 telemetry 依赖从全局模块调用改成注入式边界
- 这轮先只收 query 主路径，没有顺手把全仓全部 observability 一口气推平

### `ModelPolicyService`

解决的问题：

- `query-model` 直接依赖 `MODEL_POLICY`
- 模型选择、fallback 与 usage finalize 还是常量管理器直连
- subagent 里也还在直接依赖同一条 model policy 入口

落地后：

- `query-model` 改为通过 `modelPolicyService` 做 model select / fallback / finalize
- app runtime 和 `QueryEngine` 把 model policy 也纳入显式依赖面
- subagent 侧开始改走默认 `ModelPolicyService`

### `MemoryService`

解决的问题：

- `query-preparation` 还直接依赖 memory 模块函数
- memory add / search / list 虽然已经有底层实现，但 base tools 侧没有进入 app-level service 边界

落地后：

- `query-preparation` 改为通过 `memoryService` 做 auto extract 与 query injection
- base memory tools 开始改走默认 `MemoryService`
- memory 能力开始进入共享 runtime service 依赖面

## 这组改造采纳了什么

### 采纳

- 把 query runtime 的核心横切依赖全部抬成正式 service
- 让 app runtime 更接近真实 composition root
- 让 `QueryEngine` 周围形成更稳定的依赖图
- 让测试开始和 runtime service 边界对齐

### 暂不采纳

- 还没有把所有 service 进一步收进统一 `services/` 目录体系
- 还没有把全仓所有 observability 调用点全部切到 service
- 还没有把 memory 等其他横切能力也全部 service 化
- 还没有清空所有 compatibility wrapper

原因很简单：这一组的目标是先把 `QueryEngine` 周围最关键的一圈依赖站稳，而不是一次性做全局形态重写。

## 到这里就先停

完成这组之后，当前 query 主体已经从：

- `QueryEngine + 一堆零散模块函数`

推进到：

- `QueryEngine`
- `ToolService`
- `DeliveryService`
- `HookService`
- `ObservabilityService`
- `ModelPolicyService`
- `MemoryService`

下一步更自然的方向是：

- 继续判断哪些 runtime 能力值得进入同一组 service 边界
- 看 autonomy / scheduler / notification 这类能力要不要继续显式化
- 再决定这些 service 要不要进入更系统的目录与装配形态
