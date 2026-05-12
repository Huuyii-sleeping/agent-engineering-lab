# 第十八轮学习沉淀：ObservabilityService 显式化第一轮

## 这轮真正学到的东西

### 1. query 主路径里最容易继续扩散的横切依赖，是 observability

在 hook service 落完之后，继续看 `QueryEngine` 周围会发现：

- `query-engine` 负责 trace 起点
- `query-model` 负责 model request / response / recovery 事件
- `query-tools` 负责 tool call / result / security 事件
- `query-notifications` 负责 notification 事件

这些点如果都继续直接依赖 `observability/runtime.ts`，那 query 虽然已经拆成多 stage，但 observability 还是横着把它们重新绑回去了。

### 2. 这轮真正显式化的不是“日志函数”，而是 query runtime 的 telemetry 边界

这轮新增 `ObservabilityService`，先只覆盖 query 主路径真正需要的方法：

- `createTraceId`
- `createSpanId`
- `withExecutionContext`
- `recordEvent`

这样做的价值是：

- `QueryEngine` 不再直接依赖 observability runtime 模块
- query stages 的 telemetry 依赖可以通过 composition root 统一注入
- tests 可以注入 fake observability service，而不是到处 mock 模块函数

### 3. 这轮的关键克制，是只收 query 侧，不顺手把全仓 observability 一把推平

仓库里还有：

- `delivery.ts`
- `subagent`
- `background-task`
- `mcp`
- `hooks/runner`

也在直接使用 observability runtime。

这轮没有把它们一起全改掉，而是先把 query runtime 主链路收稳。这比“一次性全局替换”更符合增量重构。

## 这轮怎么映射到本仓库

### 原来的问题

- `query-engine.ts` 直接依赖 `createTraceId / recordObservabilityEvent`
- `query-model.ts` 直接依赖 `recordObservabilityEvent`
- `query-tools.ts` 直接依赖 `createSpanId / withExecutionContext / recordObservabilityEvent`
- `query-notifications.ts` 直接依赖 `recordObservabilityEvent`
- app runtime / `AgentService` / `QueryEngine` 依赖面里没有显式 observability service

### 这轮实际做的事

1. 新增 `apps/agent-cli/src/observability-service.ts`
2. 定义 `ObservabilityServiceLike` 与默认 `ObservabilityService`
3. 让 `bootstrap/app-runtime.ts` 把 `observabilityService` 纳入共享装配
4. 让 `agent-loop.ts` compatibility wrapper 补齐默认 `observabilityService`
5. 让 `AgentService` 透传 `observabilityService`
6. 让 `QueryEngine` 显式持有 `observabilityService`
7. 让 `query-preparation / query-notifications / query-model / query-tools` 改走 `observabilityService`
8. 把相关 runtime unit test 改成注入 fake `observabilityService`

## 本轮采纳了什么

### 采纳

- 把 query telemetry 提升为正式 service 边界
- 让 query 主路径不再散落依赖 observability runtime 模块
- 让 runtime 单测更贴近真实依赖注入模型

### 暂不采纳

- 还没有把全仓所有 observability 调用点都统一切到 service
- 还没有把 model policy 也继续提成并列 service
- 还没有做 service 聚合对象或更系统的 services 目录编排

原因是这轮先把 query runtime 这条最关键主线收口。

## 到这里就先停

完成这轮之后，当前 query 主体已经更接近“显式装配的运行时”：

- `QueryEngine`
- `ToolService`
- `DeliveryService`
- `HookService`
- `ObservabilityService`

下一步更自然的问题会变成：

- model policy 要不要继续显式化
- query runtime services 要不要开始进入更系统的组织方式
