# 第六轮学习沉淀：tool 注册表第一轮

## 这轮真正学到的东西

### 1. 统一执行链之后，下一步就该统一注册入口

上一轮已经把 `base` 工具也并入共享执行器，但“工具定义在哪里、handler 在哪里、preview 在哪里”仍然分散在 `base.ts` 和 `index.ts` 里。

这意味着：

- 执行治理已经开始统一
- 但工具注册信息还没有收成正式入口
- 后面继续加 metadata 或更多工具来源时，仍然会回到分散维护

所以这轮最自然的动作，不是继续加 if/else，而是先把本地工具注册入口显式化。

### 2. registry 的第一步不是复杂对象模型，而是先把“声明 + 解析”放到一个位置

这一轮没有直接引入完整的 `ToolRegistry` 类，而是先做更轻量的结构收口：

- 把 `base + subagent` 视为 builtin tools
- 把 builtin tools 的 handler 解析集中到 `tools/registry.ts`
- 把 preview 逻辑也收进去

这样做的价值是：先把“注册入口”建立起来，再决定后面要不要继续长成更完整的对象模型。

### 3. `tools/index.ts` 更适合只做来源分发

收口之后，`tools/index.ts` 的职责更清楚了：

- builtin tools 走本地 registry
- mcp tools 走外部 registry
- index 本身只负责来源分发和统一执行器接线

这比让 `index.ts` 继续自己维护一份 subagent handler 和 preview 规则更稳定。

## 这轮怎么映射到本仓库

### 原来的问题

- `base.ts` 有自己的 handler 解析
- `index.ts` 还有一份 subagent handler 和 preview 逻辑
- builtin tools 没有显式的注册入口文件

### 这轮实际做的事

1. 新增 `tools/registry.ts`
2. 把 `base + subagent` 组合成 `BUILTIN_TOOLS`
3. 抽出 `resolveBuiltinToolHandler(...)`
4. 抽出 `previewBuiltinToolCall(...)`
5. 让 `tools/index.ts` 只负责 builtin / mcp 分发

## 本轮采纳了什么

### 采纳

- 先建立轻量 registry 入口
- 让 builtin tools 的解析逻辑单点收口
- 让 `tools/index.ts` 更像来源分发层

### 暂不采纳

- 还没有引入完整的 ToolRegistry 类
- 还没有把 mcp registry 和 builtin registry 进一步统一成同一种对象模型
- 还没有把 observability / permission metadata 一并挂到 registry 节点上

原因是这轮目标仍然是稳定边界，不是一次性把工具协议层完全定型。

## 这轮改完后，下一步最自然的方向

1. 继续把 builtin registry 补上更明确的 metadata
2. 分析 `agent-loop.ts` 还能继续往 query 核心边界收哪些横切职责
3. 再决定是否把 builtin / mcp registry 统一到同一抽象
