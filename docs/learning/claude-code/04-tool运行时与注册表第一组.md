# 第四轮学习沉淀：Tool 运行时与注册表第一组

## 这组改造真正学到的东西

### 1. 工具层最先要统一的不是目录，而是执行链

如果工具层还是靠 `runToolByName(...)` 里一层层 `if/else` 去同时处理：

- 路由判断
- replay dry-run
- security gate
- handler 执行
- runtime error 包装

那后面继续加工具来源、加策略、加观测点时，很快又会重新长回一个大分支函数。

所以这组改造最先处理的，不是“文件怎么摆”，而是“执行链怎么统一”。

### 2. 真正稳定的工具边界，需要同时收三层东西

这组最终收口的，不只是执行器本身，而是三层配套边界：

- `tool-runtime`
  - 负责显式执行对象、目标解析、共享执行治理
- `base tool` 收口
  - 负责把本地工具也并入同一执行链
- `registry`
  - 负责把 builtin tools 的声明、handler、preview 收成正式注册入口

如果只做其中一层，工具边界还是会重新散掉。

### 3. `base.ts` 更适合逐步退到“注册表角色”，不适合继续承担全部 runtime 治理

这组改造往后看，方向越来越清楚：

- `base.ts` 适合放工具声明
- 适合放 handler 注册
- 适合放 preview、replay-safe 这类元信息
- 但 replay、security、runtime error 包装应尽量回到共享执行器

也就是说，`base.ts` 更像本地工具 registry，而不是完整工具 runtime。

## 这组改造怎么映射到本仓库

### 原来的共同问题

- `tools/index.ts` 混着来源分发、执行治理和 handler 调用
- `subagent / mcp / base` 没有真正共享一条执行链
- builtin tools 的声明、解析、preview 还没有单独注册入口

### 这组实际做的事

1. 新增 `runtime/tool-runtime.ts`
2. 抽出 `ToolExecution` / `ToolExecutionTarget`
3. 抽出 `resolveToolExecution(...)`
4. 抽出 `executeProtectedToolHandler(...)`
5. 让共享执行器支持 replay 与 `allowDuringReplay`
6. 让 `base` 工具也并入统一执行链
7. 新增 `tools/registry.ts`
8. 把 `base + subagent` 组合成 builtin tools 注册入口
9. 抽出 builtin handler 解析与 preview 逻辑
10. 让 `tools/index.ts` 退回到 builtin / mcp 来源分发层

## 这组里每一层分别解决了什么

### `tool-runtime`

解决的问题：

- 工具调用只是字符串分支
- replay / security / runtime error 包装散在不同来源上

落地后：

- 先解析成 `ToolExecution`
- 再按 `base / subagent / mcp / unknown` 决定执行目标
- 共享执行器开始承接 replay / security / error 治理

### `base` 工具收口

解决的问题：

- `subagent / mcp` 已经开始走共享执行器
- `base` 工具还保留自己的一套执行包装

落地后：

- `base` 也并入同一条共享执行链
- replay-safe 变成显式执行策略，而不是工具实现细节
- `base.ts` 开始更接近 registry / metadata 角色

### `tools/registry`

解决的问题：

- builtin tools 的 handler、preview、声明还分散在多个文件
- `tools/index.ts` 还承担过多 builtin 细节

落地后：

- builtin tools 开始有显式注册入口
- `resolveBuiltinToolHandler(...)` / `previewBuiltinToolCall(...)` 集中到一个位置
- `tools/index.ts` 更像来源分发层

## 这组改造采纳了什么

### 采纳

- 先统一工具执行链，再统一注册入口
- 让 `base / subagent / mcp` 尽量共享执行治理
- 让 builtin tools 开始进入正式 registry 结构

### 暂不采纳

- 还没有引入完整的 `ToolRegistry` 类
- 还没有把 builtin / MCP 进一步统一成同一种更强对象模型
- 还没有把工具协议、metadata、observability middleware 一次性全部定型

原因是这组目标是先把工具层从“大分支函数”推进到“执行链 + 注册入口”。

## 到这里就先停

完成这组之后，工具层已经从：

- 分散函数路由

推进到：

- `tool-runtime`
- builtin `registry`
- 更薄的 `tools/index.ts`

下一步更自然的方向是：

- 继续往工具协议层与 registration 统一视图推进
- 继续缩小 query 主循环的横切职责
