# Query 运行时 Services 依赖包

## 这次真正学到的东西

### 1. service 进目录之后，还需要表达“这一组依赖是一组”

PRD-22 把应用级 runtime service 收进了 `services/`，但 `QueryEngine` 的构造函数仍然展开很多 service 字段。目录边界清楚了，依赖形态还不够清楚。

这轮的重点是把 `QueryEngine` 执行一轮 query 需要的横切能力表达成 `RuntimeServices`。这样调用方看到的是一个 runtime dependency set，而不是越来越长的参数列表。

### 2. `ToolService` 可以进入依赖包，但不等于迁移工具层

`ToolService` 仍然属于 `tools/` 内部协议层；它和 registry、protocol、handler 的关系更近。

但从 `QueryEngine` 视角看，工具发现与执行是一次 query round 必需的 runtime dependency，所以可以把 `toolService` 放进 `RuntimeServices` 依赖包里。这个决策只改变依赖表达，不改变文件归属。

## 放到本仓库里怎么看

### 当前已经有的基础

- `apps/agent-cli/src/services/` 已经存在
- `QueryEngine` 已经依赖显式 service
- `createAgentAppRuntime` 已经是共享 composition root

### 当前最明显的差距

- `QueryEngine` 构造函数仍展开多个 service 字段
- `createAgentAppRuntime` 里默认 service 组装逻辑还没有一个命名对象
- 测试 fake 依赖开始跟随 service 数量变宽

### 这轮只解决哪些差距

- 这轮要做的：新增 `RuntimeServices` 类型与默认创建函数，让 `QueryEngine` 持有依赖包
- 这轮不做的：不迁移 `ToolService` 文件，不重写工具协议层，不改变 query stages

## 这轮采纳了什么

### 采纳

- 新增 `services/runtime-services.ts`
- `RuntimeServices` 包含 query round 所需的 tool、delivery、hook、memory、notification、model policy、observability、runtime coordination service
- `createAgentAppRuntime` 支持整体 `runtimeServices` override，也继续支持单个 service override
- `QueryEngine` 内部通过 `runtimeServices` 访问横切依赖

### 暂不采纳

- 暂不从 `services/index.ts` re-export `runtime-services`

原因是 `RuntimeServices` 需要引用 `ToolService`，而部分 tool 又会引用 `services/index.ts`。直接 re-export 会引入不必要的运行时循环风险。

- 暂不继续收 `ToolService` 文件位置

原因是这轮只收 query runtime 的依赖表达；工具协议层第二轮应该单独做，避免同时改两个边界。

## 这轮实际改成了什么

- 新增 `apps/agent-cli/src/services/runtime-services.ts`
- `createAgentAppRuntime` 改为先创建 `runtimeServices`
- `QueryEngine` 构造参数从散开的 service 字段改为 `runtimeServices`
- `agent-service` 和相关测试补齐 `runtimeServices` 传递

改完之后，`QueryEngine` 的横切依赖有了一个稳定名字。后续再加 query runtime service 时，优先改 `RuntimeServices`，而不是继续拓宽 `QueryEngine` 构造函数。

## 下一步最自然的动作

1. 单独评估 `ToolService` 与 `tools/` 内部协议层是否需要第二轮收口。
2. 观察 query stages 是否也需要接收更小的 stage-level dependency object。
3. 等 runtime/tool 边界继续稳定后，再推进 Web 展示接入。
