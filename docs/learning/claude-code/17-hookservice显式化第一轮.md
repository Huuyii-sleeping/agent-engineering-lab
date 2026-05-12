# 第十七轮学习沉淀：HookService 显式化第一轮

## 这轮真正学到的东西

### 1. `QueryEngine` 周围最容易被忽略的耦合，不是大模块，而是分散在多个 stage 里的同一类全局函数

继续对照 query 主路径时会发现，hook 看起来只是一个小能力，但它其实横跨了：

- `query-runtime`
- `query-preparation`
- `query-tools`
- `query-finalization`

如果这些阶段都继续直接调用 `runHooks`，那即使 `QueryEngine` 已经显式化，hook 依赖仍然是散开的。

### 2. 真正要显式化的是“hook 交互边界”，而不是只把 `hooks/index.ts` 换个文件名

这轮新增 `HookService`，重点不是做语义包装，而是把运行时依赖收成一个统一注入点：

- `HookService`
  - `run(event, invocation)`

这样之后：

- app runtime 可以显式持有 hook service
- `AgentService` / CLI / server 都通过同一装配面拿到它
- `QueryEngine` 只依赖 service，不依赖 hook 模块
- query 各阶段不再各自直连 `runHooks`

### 3. 这类 service 显式化还有一个现实收益：测试会从“模块 mock”回到“依赖注入”

这轮把几组 runtime 单测从 `vi.mock("hooks/index")` 改成了注入 fake `hookService`。

这件事的价值很实际：

- 测试边界和生产代码边界一致
- 单测不再依赖模块加载时机
- 后面如果 hook 实现文件继续移动，测试不需要跟着大面积改 mock 路径

## 这轮怎么映射到本仓库

### 原来的问题

- `query-runtime.ts` 直接调用 `runHooks`
- `query-preparation.ts` 直接调用 `runHooks`
- `query-tools.ts` 直接调用 `runHooks`
- `query-finalization.ts` 直接调用 `runHooks`
- `AgentService` / `QueryEngine` / app runtime 里没有显式 hook service

### 这轮实际做的事

1. 新增 `apps/agent-cli/src/hook-service.ts`
2. 定义 `HookServiceLike` 与默认 `HookService`
3. 让 `bootstrap/app-runtime.ts` 把 `hookService` 纳入共享装配
4. 让 `agent-loop.ts` compatibility wrapper 补齐默认 `hookService`
5. 让 `AgentService` 把 `hookService` 透传到 shared query runtime
6. 让 `QueryEngine` 显式持有 `hookService`
7. 让 `query-runtime / query-preparation / query-tools / query-finalization` 改走 `hookService`
8. 把相关 unit test / smoke test 改成注入 fake `hookService`

## 本轮采纳了什么

### 采纳

- 把 hook 提升为正式 service 边界
- 让 query 主路径不再散落依赖 `runHooks`
- 让测试从全局模块 mock 迁到注入式 fake service

### 暂不采纳

- 还没有把 hook config / runner / observability 继续拆成更细层次
- 还没有把 observability 也一起提成同层 service
- 还没有把所有 runtime cross-cutting 能力组织进统一 services 目录

原因是这轮先把 `QueryEngine` 周边一块明显且高频的横切依赖收口。

## 到这里就先停

完成这轮之后，当前共享 runtime 主体已经更像明确装配，而不是函数拼接：

- `QueryEngine`
- `ToolService`
- `DeliveryService`
- `HookService`

下一步更自然的问题是：

- observability 要不要也提成正式 service
- 这些 service 要不要进入更系统的目录与装配形态
