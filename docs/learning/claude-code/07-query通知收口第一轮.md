# 第七轮学习沉淀：query 通知收口第一轮

## 这轮真正学到的东西

### 1. `agent-loop.ts` 里最该先拆的，不一定是模型调用本身，而是横切通知逻辑

在当前仓库里，`agent-loop.ts` 最重的部分之一不是单纯的 query 提交，而是：

- scheduled prompt 注入
- subagent 通知注入
- background task 通知注入
- team 通知注入
- 对应的 observability 记录

这些逻辑都和“一轮 query 的核心状态推进”有关，但不应该继续堆在主循环里。

### 2. 先把“动态 system message 组装”收成 helper，比直接硬拆完整 QueryEngine 更稳

这一轮没有直接重写 `agent-loop.ts` 的主循环，而是先把一块边界相对清楚的职责抽出来：

- 从多个通知源拉取提醒
- 组装动态 system messages
- 记录通知型 observability 事件

这一步的价值是：

- 主循环变短
- query runtime 的辅助职责开始有正式归属
- 后面继续拆 memory 注入、tool result 收尾会更顺手

### 3. query runtime 里共享的 message helper 也应该显式化

`appendSystemMessages(...)` 之前同时存在于 `agent-loop.ts` 和 `query-runtime.ts`。这类小函数本身不复杂，但它们一旦重复，就说明 query runtime 的共享边界还没完全收清。

所以这轮顺手把 message helper 也收进了 `runtime/`。

## 这轮怎么映射到本仓库

### 原来的问题

- `agent-loop.ts` 同时承担通知收集、message 拼接和 observability 记录
- `appendSystemMessages(...)` 在两个文件重复出现
- query 边界虽然已经开始抽，但辅助职责还没完全搬出去

### 这轮实际做的事

1. 新增 `runtime/query-messages.ts`
2. 新增 `runtime/query-notifications.ts`
3. 把 `appendSystemMessages(...)` / `findLastAssistantText(...)` 收成共享 helper
4. 把多来源通知收集与 system message 组装从 `agent-loop.ts` 抽出
5. 补 `query-notifications` 单测覆盖

## 本轮采纳了什么

### 采纳

- 优先拆横切通知逻辑
- 把 query 相关小型共享 helper 正式收进 `runtime/`
- 让 `agent-loop.ts` 更接近 query 执行骨架

### 暂不采纳

- 还没有拆 model request / recovery / compaction 主链
- 还没有把 memory 注入进一步独立成单独 query stage
- 还没有引入完整 QueryEngine 类结构

原因是这轮仍然坚持渐进式收口，不做大爆炸重写。

## 这轮改完后，下一步最自然的方向

1. 继续分析 `agent-loop.ts` 中 memory 注入与 tool result 收尾逻辑
2. 评估是否把 query stage 再往更明确的 pipeline 结构推进
3. 在 query 边界稳定后，再回头决定 registry metadata 要不要继续扩展
