# 第十五轮学习沉淀：ToolService 显式化第一轮

## 这轮真正学到的东西

### 1. 有了 `ToolRegistration` 还不够，调用面如果还在直接用函数集合，service 边界仍然不够稳

上一轮我们已经把 builtin / MCP 拉到了统一 registration 视图，但继续对照源码边界会发现：

- `QueryEngine` 还在等调用方把 `tools` 先准备好
- query tool stage 还在直接依赖 `previewToolCall / runToolByName`
- app runtime、service、CLI 还没有共享一个明确的 tool service 主对象

这说明工具层虽然有协议了，但还缺一个正式 service。

### 2. `ToolService` 的价值，是让 query runtime 不再手工拼工具依赖

这轮把 `ToolService` 立出来之后，关系更清楚了：

- `ToolService`
  - 统一负责工具发现、registration、metadata、preview、执行
- `QueryEngine`
  - 直接依赖 `ToolService`
  - 需要工具 schema 时向 service 请求
  - 执行 tool stage 时也通过 service 走

这样之后，query engine 和 tool 协议层才真正开始形成正式协作关系。

### 3. 到这一步，app runtime 里真正有了两块核心 service

现在共享装配里已经能更明确地看到两块主对象：

- `queryEngine`
- `toolService`

这比之前“一个 engine + 若干 resolver function”的形态稳定得多，也更像真实产品代码里的 composition root。

## 这轮怎么映射到本仓库

### 原来的问题

- app runtime 里还是 `toolsResolver`
- `QueryEngine.run(...)` 还要由调用方传入 tools
- query tool stage 直接依赖全局工具函数
- service / CLI / query runtime 还没有统一依赖同一个 tool service 主对象

### 这轮实际做的事

1. 新增 `tools/service.ts`
2. 定义 `ToolServiceLike` 与默认 `ToolService`
3. 让 `tools/index.ts` 退回到默认 service 的薄包装
4. 让 `bootstrap/app-runtime` 持有 `toolService`
5. 让 `QueryEngine` 直接依赖 `toolService`
6. 让 query tool stage 改为通过 `toolService` 做 preview / run
7. 移除主路径上的 `toolsResolver`

## 本轮采纳了什么

### 采纳

- 把 tool service 提成和 `QueryEngine` 并列的正式 service
- 让 app runtime 的共享装配更显式
- 让 query runtime 不再由调用方手工提供 tools 依赖

### 暂不采纳

- 还没有把更多 runtime services 继续统一组织到更明确目录
- 还没有把 observability / delivery / memory 这些也提成同层 service
- 还没有继续做更系统的第二轮逐文件差距地图

原因是这一轮先把 `QueryEngine` 最近的一块正式依赖站稳。

## 到这里就先停

这轮完成后，当前结构已经不只是“显式 QueryEngine”，而是开始有了更明确的 `QueryEngine + ToolService` 核心配对。下一步更自然的是：

- 回头做第二轮逐文件差距分析
- 判断 services 目录下还要不要继续抬出更多正式 service
