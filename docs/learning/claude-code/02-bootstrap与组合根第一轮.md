# 第二轮学习沉淀：bootstrap 与组合根第一轮

## 这轮真正学到的东西

### 1. 入口层应该先统一装配，再谈 runtime 抽离

如果入口层还在各自偷偷 `new` 默认依赖，后面根本没法稳定抽出 query runtime。  
所以顺序应该是：

- 先把 CLI、HTTP service 的默认依赖装配收拢
- 再把 runtime 从入口层继续往外抽
- 最后才是更大的结构整理

### 2. 组合根的价值，不是多一个文件，而是把默认装配变显式

这轮最关键的不是 `app-runtime.ts` 这个文件本身，而是这件事：

- 以前 `cli.ts`、`server.ts`、`AgentService` 都各自带着一部分默认装配逻辑
- 现在把它们收敛到一个共享入口
- 这意味着后面要继续拆 runtime 时，不用再先清理入口层重复逻辑

### 3. `AgentService` 不该再偷偷自装配

这轮一个很实在的结构改进是：

- 让 `AgentService` 显式接收装配好的依赖
- 而不是内部默认去 `createClient()`、`getDefaultModel()`、`getStaticPromptSource()`

这会让它更像应用服务，而不是一边做业务、一边做入口装配。

## 这轮怎么映射到本仓库

### 原来的问题

- CLI 和 HTTP service 的默认依赖装配分散
- 会话 runtime state 构造重复出现
- service 既承担应用逻辑，也偷偷承担默认装配

### 这轮实际做的事

1. 新增共享 `bootstrap/app-runtime.ts`
2. 抽出 `createAgentAppRuntime(...)`
3. 抽出 `createAgentRuntimeState(...)`
4. 让 `server.ts` 和 `cli.ts` 都通过同一装配入口拿默认依赖
5. 让 `AgentService` 只吃依赖，不再自己负责默认创建

### 这轮没有做的事

- 还没有拆 `agent-loop.ts`
- 还没有引入真正独立的 query runtime
- 还没有整理 tool runtime 协议层
- 还没有动 Web 展示层

## 本轮采纳了什么

### 采纳

- 先统一装配，再继续抽 runtime
- 先做最小结构整理，不做大爆炸式重写
- 先把共享依赖入口收拢，再让多入口复用同一骨架

### 暂不采纳

- 不直接照搬完整 `QueryEngine` 结构
- 不直接大拆整个 `agent-loop.ts`
- 不在这轮顺手整理 Web 或工具协议层

原因很简单：这轮目标是把“后面能不能继续稳步重构”这件事先打通。

## 这轮改完后，下一步最自然的方向

1. 设计 query runtime 的独立契约
2. 继续缩小 `agent-loop.ts` 的职责面
3. 在 runtime 边界更稳之后，再系统整理 tool runtime
