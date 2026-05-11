# 第四轮学习沉淀：tool 运行时第一轮

## 这轮真正学到的东西

### 1. 工具层最先要统一的不是目录，而是执行链

如果工具层还是靠 `runToolByName(...)` 里一层层 `if/else` 去同时处理：

- 路由判断
- replay dry-run
- security gate
- handler 执行
- runtime error 包装

那后面继续加工具来源、加策略、加观测点时，很快又会重新长回一个大分支函数。

所以这轮最重要的学习点是：先把执行链收成统一步骤，而不是先执着于文件怎么分。

### 2. tool runtime 的第一步，是把调用先解析成显式执行对象

这轮引入的关键意识是：

- 先把工具调用解析成一个 `ToolExecution`
- 再决定它属于 `base / subagent / mcp / unknown` 哪一路
- 然后交给共享执行器去处理 replay、security 和 handler 调用

这样一来，工具层不再只是“字符串名字碰运气”，而开始有正式运行时对象。

### 3. 安全门禁和 replay 拦截本质上属于执行链，而不是某一路工具私有逻辑

这轮收出来的另一个关键点是：

- `REPLAY_DRY_RUN_BLOCKED`
- `SECURITY_APPROVAL_REQUIRED`
- runtime error 包装

这些东西本质上都属于共享执行链，而不是 subagent 或 MCP 自己各写一遍。

也就是说，工具来源不同，但执行治理逻辑应该尽量共享。

## 这轮怎么映射到本仓库

### 原来的问题

- `tools/index.ts` 里混着路由判断、replay、security、handler 调用
- subagent 和 MCP 的保护逻辑写法高度相似
- 工具层有统一路由雏形，但没有显式执行对象和共享执行器

### 这轮实际做的事

1. 新增 `runtime/tool-runtime.ts`
2. 抽出 `ToolExecution` / `ToolExecutionTarget`
3. 抽出 `resolveToolExecution(...)`
4. 抽出 `executeProtectedToolHandler(...)`
5. 让 `tools/index.ts` 改成先解析执行对象，再分发到对应 handler

### 这轮没有做的事

- 还没有把 base tool 内部执行链完全并到同一执行器
- 还没有引入完整 tool registry 对象模型
- 还没有把 observability 事件进一步推到更显式的工具协议层

## 本轮采纳了什么

### 采纳

- 先统一工具执行链，再继续完善 registry
- 先显式化运行时对象，再谈更复杂的工具协议
- 让 replay / security 这类治理逻辑尽量走共享执行器

### 暂不采纳

- 不直接重写整个 `tools/base.ts`
- 不在这轮强行把所有工具都抽成类或完整 registry 实例
- 不把 observability 进一步扩成完整工具调用中间件系统

原因是这轮目标是先把“执行链边界”收清，而不是一次把工具层全重做。

## 这轮实际改成了什么

- 改了哪些核心结构：
  - 新增 `runtime/tool-runtime.ts`
  - `tools/index.ts` 改为先构造 `ToolExecution`，再走共享执行器
- 改完之后带来什么变化：
  - subagent / MCP 路由更显式
  - replay 和 security 执行链开始共享
  - 下一轮若继续做 tool registry，会有明确落点
- 还有什么没收干净：
  - base tools 仍有自己的一层内部执行包装
  - 工具层还没有完整的 registry / metadata / execution context 对象模型

## 下一步最自然的动作

1. 决定是否继续把 base tool 也并入同一执行链
2. 进一步缩小 `agent-loop.ts` 的横切职责
3. 在 agent 工具层边界更稳定后，再承接 Web 展示层
