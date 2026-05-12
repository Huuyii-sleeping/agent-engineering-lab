# 第十四轮学习沉淀：QueryEngine 显式化第一轮

## 这轮真正学到的东西

### 1. 把 query stages 都拆出来之后，如果还只是一个函数，就还没有真正到 `QueryEngine`

前几轮我们已经把 query core 分成了：

- preparation
- model
- tools
- finalization

但如果这些阶段最终还是挂在 `agent-loop.ts` 这个函数名下，那边界虽然更清楚了，主语义还是不够稳。

### 2. `QueryEngine` 的价值，不只是改名，而是让调用方开始依赖“engine 对象”

这轮真正重要的不是把 `agent-loop` 挪一下，而是让这些层开始面向同一个 engine：

- app runtime
- query runtime
- CLI scheduled round
- agent service

这样之后，query 不再只是某个函数入口，而是应用运行时里一块正式服务。

### 3. `agent-loop` 到这里应该退成兼容层，而不是核心边界

这轮之后更合理的关系是：

- `QueryEngine`
  - 正式承载 query round orchestration
- `agent-loop`
  - 只是保留给现有 smoke / 兼容路径的 wrapper

这更贴近外部源码里 `QueryEngine` 不是“叫法”，而是核心运行时对象。

## 这轮怎么映射到本仓库

### 原来的问题

- 虽然 query stage 已经拆开，但主入口还是 `agentLoop(...)`
- app runtime、CLI、service 仍依赖 `loopRunner` 函数语义
- query runtime 还没有显式 engine 主对象

### 这轮实际做的事

1. 新增 `runtime/query-types.ts`
2. 新增 `runtime/query-engine.ts`
3. 把 orchestration 主链放进 `QueryEngine.run(...)`
4. 让 `bootstrap/app-runtime` 持有 `queryEngine`
5. 让 `runtime/query-runtime`、`cli`、`agent-service` 改为依赖 `queryEngine`
6. 把 `agent-loop.ts` 退回成兼容 wrapper

## 本轮采纳了什么

### 采纳

- 让 `QueryEngine` 成为正式运行时对象
- 让调用方直接依赖 engine，而不是继续拿 loop function 传来传去
- 把 shared query orchestration 再往“runtime service”方向收一层

### 暂不采纳

- 还没有把 `QueryEngine` 再拆成更显式的 session/query 对象组合
- 还没有把 tool service 再抬成和 engine 并列的正式 service
- 还没有继续把更多 runtime services 重新组织目录

原因是这一轮先把最关键的主对象立起来，避免继续长期停留在函数式兼容层。

## 到这里就先停

这轮完成后，当前 query core 已经不只是“阶段拆开”，而是显式落成 `QueryEngine`。下一步更自然的是：

- 继续对照源码校正 `QueryEngine` 与 tool service 的关系
- 判断 services 边界是否还需要再抬一级
