# 第十六轮学习沉淀：DeliveryService 显式化第一轮

## 这轮真正学到的东西

### 1. `QueryEngine` 显式化之后，下一步不是继续拆函数，而是把剩余跨边界能力也变成 service

前两轮已经把 `QueryEngine` 和 `ToolService` 立出来了，但继续看运行时主路径会发现：

- `query-finalization` 还直接调用 delivery 函数
- `base` 工具里的 delivery 能力也还是直接连到 `delivery.ts`
- app runtime 虽然已经有 query / tool 两个核心 service，但 delivery 还停留在“全局函数模块”

这会导致一个问题：query 和 tools 虽然已经开始解耦，但 delivery 还没有进入同一层级的依赖模型。

### 2. 真正需要显式化的，不是 `delivery.ts` 文件，而是“交付校验能力”这个 runtime 边界

这轮没有急着把 delivery 全部重写，而是先把边界立出来：

- `DeliveryService`
  - `loadLatestReport`
  - `runValidation`
  - `runValidateTool`
  - `runReportTool`

这样处理的价值在于：

- `QueryEngine` 不再知道 delivery 的实现函数名
- `query-finalization` 不再依赖具体 delivery 模块
- `base` 工具也开始通过同一主对象访问 delivery 能力
- 测试可以直接注入假的 delivery service，而不是 mock 整个模块

### 3. 这一刀的重点是“显式依赖闭环”，不是“兼容层清零”

当前依然保留了 `delivery.ts`，但它已经更像底层实现模块，而不是主路径直接依赖的边界。

这说明一个很实用的重构原则：

- 第一刀先把 service 边界立起来
- 第二刀再看兼容层要不要继续收口

不要在第一刀里同时追求“显式化 + 彻底清除旧模块入口”，那样容易把风险抬高。

## 这轮怎么映射到本仓库

### 原来的问题

- `query-finalization.ts` 直接调用 `runDeliveryValidation`
- `tools/base.ts` 直接调用 delivery tool 函数
- `QueryEngine` 虽然已经显式化，但 auto delivery 还不是通过注入边界完成
- `AgentService` / runtime 依赖面里还没有显式 delivery service

### 这轮实际做的事

1. 新增 `apps/agent-cli/src/delivery-service.ts`
2. 定义 `DeliveryServiceLike` 与默认 `DeliveryService`
3. 让 `query-finalization.ts` 改为依赖 `deliveryService`
4. 让 `QueryEngine` 显式持有 `deliveryService`
5. 让 `bootstrap/app-runtime.ts` 把 `deliveryService` 纳入共享装配
6. 让 `agent-loop.ts` compatibility wrapper 补齐默认 `deliveryService`
7. 让 `tools/base.ts` 的 delivery 相关 handler 改走默认 `DeliveryService`
8. 补齐 `agent-service`、runtime、smoke test 的依赖注入

## 本轮采纳了什么

### 采纳

- 把 delivery 提升为正式 service 边界
- 让 query / tools / app runtime 开始共享同一套 delivery 注入方式
- 让测试从“mock delivery 模块”转向“注入 fake service”

### 暂不采纳

- 还没有把 `delivery.ts` 完全退成薄包装或拆目录
- 还没有把 observability / memory / hook 继续提成同层 service
- 还没有给 delivery service 再做第二轮更细协议抽象

原因是这轮目标只是先把 `QueryEngine` 周围剩余的一块明显跨边界能力收口。

## 到这里就先停

完成这轮之后，app runtime 的核心形态已经更明确了：

- `QueryEngine`
- `ToolService`
- `DeliveryService`

下一步更自然的方向，不再是机械抽段，而是继续判断：

- 还有哪些 runtime 能力值得提成正式 service
- 现有 `delivery.ts` / `tools/index.ts` / `agent-loop.ts` 这些兼容层要不要继续变薄
