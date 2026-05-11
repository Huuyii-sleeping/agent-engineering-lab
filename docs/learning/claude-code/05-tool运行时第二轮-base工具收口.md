# 第五轮学习沉淀：tool 运行时第二轮（base 工具收口）

## 这轮真正学到的东西

### 1. 工具执行链要统一到“最后一层”，不能只统一一半

上一轮虽然已经把 `subagent / mcp` 的 replay、security 和 runtime error 包装收到了共享执行器里，但 `base` 工具还保留着自己的一套执行包装。

这会带来一个很实际的问题：

- 表面上已经有统一 `ToolExecution`
- 实际上 `base` 和 `subagent / mcp` 还是两条执行链
- 后面继续加 registry、metadata、observability 时，很容易再次分叉

所以这轮最重要的认识是：工具执行链要统一到最后一层，而不是只统一路由入口。

### 2. `base.ts` 更适合承载“注册表”，不适合继续承载执行治理

这一轮更清楚地看到：

- `base.ts` 适合放工具声明
- 适合放 handler 注册
- 适合放 preview 和 replay-safe 这类元信息
- 但 replay 拦截、security gate、runtime error 包装应该尽量回到共享执行器

也就是说，`base.ts` 更像一个本地工具 registry，而不是完整 runtime。

### 3. replay-safe 是执行策略，不是工具实现细节

`read_file`、`task_get`、`memory_list` 这些工具之所以在 replay 里还能执行，不是因为它们“恰好写在 base tools 里”，而是因为它们有明确的执行策略：

- 允许 replay
- 仍然走 security gate
- 仍然走共享错误包装

这说明 replay-safe 应该作为共享执行器的输入，而不是藏在某一路工具的私有实现里。

## 这轮怎么映射到本仓库

### 原来的问题

- `tools/index.ts` 已经统一了 `subagent / mcp` 的执行器入口
- `base.ts` 仍然自己处理 replay、security、try/catch
- `runBaseToolByName(...)` 和 `executeProtectedToolHandler(...)` 有重复职责

### 这轮实际做的事

1. 让共享执行器支持 `allowDuringReplay`
2. 把 `base` 工具的 replay / security / error 包装收回 `executeProtectedToolHandler(...)`
3. 在 `base.ts` 暴露 `resolveBaseToolHandler(...)`
4. 让 `tools/index.ts` 对 `base / subagent / mcp` 都走同一种“先解析 handler，再走共享执行器”的路径
5. 补单测验证 replay 默认阻断与 replay-safe 例外

## 本轮采纳了什么

### 采纳

- 把 `base` 工具也并入统一执行链
- 让 `base.ts` 更偏向 registry / metadata 角色
- 把 replay-safe 变成显式执行策略

### 暂不采纳

- 还没有引入完整的 tool registry 对象模型
- 还没有把 `ToolExecution` 扩成更完整的 metadata / context 对象
- 还没有把 observability 进一步升级成显式 tool middleware

原因是这轮目标仍然是继续收口边界，而不是一次把整个工具协议层定死。

## 这轮改完后，下一步最自然的方向

1. 继续把工具声明、handler、metadata 往更明确的 registry 结构推进
2. 对照外部源码继续分析 `services / state / query` 的真实边界
3. 进一步缩小 `agent-loop.ts` 的横切职责
